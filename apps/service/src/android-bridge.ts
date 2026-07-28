import * as Adb from "@supervisor/core/adapters/adb/shell";
import * as AndroidBridge from "@supervisor/core/android-bridge/machine";
import type { LabRegistry } from "@supervisor/core/db";
import * as Errors from "@supervisor/core/errors";
import * as Network from "@supervisor/core/network";
import * as Retry from "@supervisor/core/retry/retry";
import type * as Shell from "@supervisor/core/shell";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { AdbDeviceStream } from "./adb/adb-stream";
import * as Gating from "./gating";

// Cadenza di polling di `awaitIdle` - non ha bisogno di essere configurabile: è solo la
// granularità con cui si ricontrolla lo stato già mantenuto in memoria (nessun costo I/O),
// il tempo totale di attesa è governato dal `timeoutMs` passato dal chiamante.
const AWAIT_IDLE_POLL_MS = 2000;

const awaitIdleTimeout = (cameraId: string, timeoutMs: number): Shell.CommandTimeoutError =>
  Errors.of("CommandTimeout")(`Timed out waiting for "${cameraId}" to become Idle after ${timeoutMs}ms`);

// -------------------------------------------------------------------------------------
// Orchestrator - una istanza della FSM android-bridge per ogni camera controlled.
//
// Due ingressi indipendenti aggiornano lo stato:
//  - `reconcile(registry)`, chiamato dal tick di activation (config.activation.polling):
//    allinea le istanze alle camere controlled correnti e ritenta la connessione
//    di quelle Disconnected.
//  - la subscription su `adbDeviceStream` (già polled con cadenza config.tracking.adb.polling
//    da tracking/adb.ts, nessun poll ADB aggiuntivo qui): rileva in tempo reale una camera Idle
//    che non risulta più raggiungibile e dispatcha ConnectionLost, cosa che fa scattare il
//    reject dei comandi (Model.acceptsCommands) fino al prossimo reconcile che la riconnette.
// -------------------------------------------------------------------------------------

export interface Handle {
  readonly reconcile: (registry: LabRegistry) => TE.TaskEither<Adb.Error, void>;
  readonly acceptsCommands: (cameraId: string) => boolean;
  // Attende che la camera raggiunga Idle (riconnessa, es. dopo un reboot), senza fare I/O
  // proprio: si limita a ripollare lo stato già mantenuto qui, aggiornato dal reconcile tick
  // (mDNS + re-pairing) e dalla subscription su adbDeviceStream - vedi RECOVERY-REBOOT-LOOP.md.
  // Non fallisce mai per "device ancora giù": scade con CommandTimeoutError dopo `timeoutMs`.
  readonly awaitIdle: (cameraId: string, timeoutMs: number) => TE.TaskEither<Shell.CommandTimeoutError, void>;
  // Invalida esplicitamente una camera Idle (es. subito dopo aver dispatchato un reboot):
  // senza questo, lo stato qui resta "Idle" (stale) finché il prossimo poll di adbDeviceStream
  // (tracking.adb.polling, fino a 10s) non se ne accorge da solo - e awaitIdle, leggendo quello
  // stato stale, tornerebbe subito invece di aspettare davvero. No-op se non è Idle. Solo
  // bookkeeping FSM, nessun I/O: adatto quando sappiamo per certo che il device è appena andato
  // via per una ragione reale (es. reboot appena dispacciato con successo).
  readonly markDisconnected: (cameraId: string, reason: string) => TE.TaskEither<never, void>;
  // Come markDisconnected, ma per il caso "il transport è incastrato": adb devices continua a
  // riportare la camera come raggiungibile pur non rispondendo più (non rilevabile da
  // ConnectionLost, vedi TODO "Disconnect+reconnect esplicito su comando fallito"). A differenza
  // di markDisconnected, esegue anche un `adb disconnect` esplicito sul target prima di
  // invalidare lo stato: un semplice reconnect non basta a ripulire una entry di transport stale
  // nella tabella locale di adb - stesso pattern già usato per gli stray host (vedi sotto).
  // Best-effort: un fallimento del disconnect esplicito non impedisce comunque l'invalidazione.
  readonly forceReconnect: (cameraId: string, reason: string) => TE.TaskEither<never, void>;
  readonly snapshot: () => ReadonlyMap<string, AndroidBridge.AndroidBridgeState>;
  readonly stop: () => void;
}

const isReachable =
  (target: Network.Endpoint) =>
  (devices: readonly Adb.Device[]): boolean =>
    devices.some((d) => d.status === "device" && Network.EqByIp.equals(d.target, target));

export const create = (env: AndroidBridge.AndroidBridgeMachineEnv, adbDeviceStream: AdbDeviceStream): Handle => {
  const states = new Map<string, AndroidBridge.AndroidBridgeState>();

  // Best-effort: un fallimento in disconnessione non deve far fallire l'intero reconcile,
  // si logga soltanto (verrà ritentato al prossimo ciclo)
  const disconnectStray = (target: Network.Endpoint): TE.TaskEither<Adb.Error, void> =>
    pipe(
      Adb.disconnect(target)({ logger: env.logger.child("ADB"), spawn: env.spawn }),
      TE.orElseFirstIOK((error) =>
        env.logger.error(`Failed to disconnect stray host ${Network.format(target)}: ${Errors.format(error)}`),
      ),
    );

  const reconcileStray = (registry: LabRegistry): TE.TaskEither<Adb.Error, void> =>
    pipe(
      TE.Do,
      TE.bind("knownHosts", () => TE.right(Gating.cameraHosts(registry))),
      TE.bind("controlledHosts", () => TE.right(Gating.controlledCameraHosts(registry))),
      TE.map(({ knownHosts, controlledHosts }) =>
        adbDeviceStream
          .snapshot()
          .filter((d) => d.status === "device")
          .filter((d) => knownHosts.includes(d.target.ip) && !controlledHosts.includes(d.target.ip))
          .map((d) => d.target),
      ),
      TE.flatMap((stray) =>
        stray.length > 0
          ? pipe(
              TE.Do,
              TE.flatMapIO(() => env.logger.info(`Disconnecting stray hosts: ${stray.map(Network.format).join(", ")}`)),
              TE.flatMap(() => TE.sequenceSeqArray(stray.map(disconnectStray))),
            )
          : TE.right(undefined),
      ),
      TE.asUnit,
    );

  // Aggiunge le camere appena diventate controlled (Disconnected, pronte al primo reconnect),
  // rimuove quelle non più controlled (il loro eventuale host resta gestito da reconcileStray),
  // e ritenta la connessione di ogni istanza attualmente Disconnected. Sequenziale (1 alla
  // volta) per non aprire connessioni ADB in parallelo, stessa convenzione di discovery.ts.
  const reconcileControlled = (controlledHosts: ReadonlyMap<string, Network.Host>): TE.TaskEither<Adb.Error, void> => {
    for (const [id, host] of controlledHosts) {
      if (!states.has(id)) states.set(id, AndroidBridge.disconnected(id, host, "not yet connected"));
    }
    for (const id of states.keys()) {
      if (!controlledHosts.has(id)) states.delete(id);
    }

    const toRetry = Array.from(states.entries()).filter(([, state]) => state._tag === "Disconnected");

    return pipe(
      TE.sequenceSeqArray(
        toRetry.map(([id, state]) =>
          pipe(
            AndroidBridge.dispatch(state, { _tag: "ReconnectRequested" })(env),
            TE.map((next) => {
              states.set(id, next);
            }),
          ),
        ),
      ),
      TE.asUnit,
    );
  };

  const accepts = (cameraId: string): boolean => {
    const state = states.get(cameraId);
    return state !== undefined && AndroidBridge.acceptsCommands(state);
  };

  // Condiviso da markDisconnected e forceReconnect: no-op se la camera non è (più) Idle - un
  // secondo invalidamento concorrente, o uno arrivato dopo che è già stata rilevata persa
  // altrove, non deve produrre una transizione spuria.
  const invalidateIdle = (cameraId: string, reason: string): TE.TaskEither<never, void> => {
    const state = states.get(cameraId);
    if (state?._tag !== "Idle") return TE.right(undefined);

    return pipe(
      AndroidBridge.dispatch(state, { _tag: "ConnectionLost", reason })(env),
      TE.map((next) => {
        states.set(cameraId, next);
      }),
    );
  };

  const unsubscribe = adbDeviceStream.subscribe((devices) => {
    for (const [id, state] of states) {
      if (state._tag !== "Idle" || isReachable(state.target)(devices)) continue;

      AndroidBridge.dispatch(state, {
        _tag: "ConnectionLost",
        reason: "Device no longer reachable via ADB",
      })(env)().then((result) => {
        if (result._tag === "Right") states.set(id, result.right);
      });
    }
  });

  return {
    reconcile: (registry) =>
      pipe(
        TE.Do,
        TE.flatMap(() => reconcileControlled(Gating.controlledCameraHostsById(registry))),
        TE.flatMap(() => reconcileStray(registry)),
      ),
    acceptsCommands: accepts,
    markDisconnected: (cameraId, reason) => invalidateIdle(cameraId, reason),
    forceReconnect: (cameraId, reason) => {
      const state = states.get(cameraId);
      if (state?._tag !== "Idle") return TE.right(undefined);

      return pipe(
        Adb.disconnect(state.target)({ logger: env.logger.child("ADB"), spawn: env.spawn }),
        TE.orElseFirstIOK((error) =>
          env.logger.error(
            `forceReconnect: explicit disconnect failed for ${Network.format(state.target)}: ${Errors.format(error)}`,
          ),
        ),
        TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
        TE.flatMap(() => invalidateIdle(cameraId, reason)),
      );
    },
    awaitIdle: (cameraId, timeoutMs) => {
      // Già Idle: nessuna attesa, nessun rumore in activity (il caso comune, device mai perso)
      if (accepts(cameraId)) return TE.right(undefined);

      env.activityStream.emit({ entityId: cameraId, source: "workflow", status: "suspended" });

      const pollPolicy = pipe(
        Retry.constantDelay(AWAIT_IDLE_POLL_MS),
        Retry.concat(Retry.limitRetries(Math.ceil(timeoutMs / AWAIT_IDLE_POLL_MS))),
      );

      return pipe(
        Retry.retryingWhile(pollPolicy, env.logger)((idle: boolean) => idle)(TE.fromIO(() => accepts(cameraId))),
        TE.map((idle) => {
          if (idle) env.activityStream.emit({ entityId: cameraId, source: "workflow", status: "resumed" });
          return idle;
        }),
        TE.flatMap((idle) => (idle ? TE.right(undefined) : TE.left(awaitIdleTimeout(cameraId, timeoutMs)))),
      );
    },
    snapshot: () => new Map(states),
    stop: unsubscribe,
  };
};
