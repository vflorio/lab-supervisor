import * as Adb from "@supervisor/core/adapters/adb/shell";
import * as AndroidBridge from "@supervisor/core/android-bridge/machine";
import type { LabRegistry } from "@supervisor/core/db";
import * as Errors from "@supervisor/core/errors";
import * as Network from "@supervisor/core/network";
import * as Retry from "@supervisor/core/retry/retry";
import type * as Shell from "@supervisor/core/shell";
import * as E from "fp-ts/Either";
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
  // Unico modo per far avanzare la macchina di una camera dall'esterno. Non c'è (e non deve
  // esserci) un metodo per ogni ragione di invalidazione: la ragione È l'evento, e quali eventi
  // siano pertinenti allo stato corrente lo decide il reducer - un evento non applicabile è un
  // no-op, quindi il chiamante non deve interrogare lo stato prima di dispatchare.
  // Err = never: la macchina traduce ogni fallimento in un evento, non in un Left.
  readonly dispatch: (cameraId: string, event: AndroidBridge.AndroidBridgeEvent) => TE.TaskEither<never, void>;
  // Attende che la camera raggiunga Idle (riconnessa, es. dopo un reboot), senza fare I/O
  // proprio: si limita a ripollare lo stato già mantenuto qui, aggiornato dal reconcile tick
  // (mDNS + re-pairing) e dalla subscription su adbDeviceStream - vedi RECOVERY-REBOOT-LOOP.md.
  // Non fallisce mai per "device ancora giù": scade con CommandTimeoutError dopo `timeoutMs`.
  readonly awaitIdle: (cameraId: string, timeoutMs: number) => TE.TaskEither<Shell.CommandTimeoutError, void>;
  readonly snapshot: () => ReadonlyMap<string, AndroidBridge.AndroidBridgeState>;
  readonly stop: () => void;
}

const isReachable =
  (target: Network.Endpoint) =>
  (devices: readonly Adb.Device[]): boolean =>
    devices.some((d) => d.status === "device" && Network.EqByIp.equals(d.target, target));

export const create = (env: AndroidBridge.AndroidBridgeMachineEnv, adbDeviceStream: AdbDeviceStream): Handle => {
  const states = new Map<string, AndroidBridge.AndroidBridgeState>();
  const adbLogger = env.logger.child("ADB");

  // Coda per camera - unico punto di scrittura di `states`. `Machine.dispatch` è un
  // read-modify-write asincrono (leggi stato -> esegui i comandi dell'intent -> scrivi stato),
  // quindi due dispatch concorrenti sulla stessa camera (es. il tick di reconcile e un
  // TransportSuspect sollevato da un workflow) partirebbero dallo stesso stato e il secondo
  // sovrascriverebbe il risultato del primo. Accodandoli, ogni dispatch legge lo stato lasciato
  // dal precedente. Serializza per camera, non globalmente: camere diverse restano parallele.
  const queues = new Map<string, Promise<void>>();

  const dispatchTo =
    (cameraId: string, event: AndroidBridge.AndroidBridgeEvent): TE.TaskEither<never, void> =>
    () => {
      const run = (queues.get(cameraId) ?? Promise.resolve())
        .then(async () => {
          const state = states.get(cameraId);
          // Camera non (più) controlled: nessuna macchina a cui consegnare l'evento
          if (!state) return;

          const result = await AndroidBridge.dispatch(state, event)(env)();
          // La macchina è Err = never: il ramo Left è irraggiungibile, resta come rete di sicurezza
          if (E.isRight(result)) states.set(cameraId, result.right);
          else env.logger.error(`Dispatch failed for "${cameraId}": ${Errors.format(result.left)}`)();
        })
        // La coda non deve mai restare avvelenata da un rejection: il prossimo dispatch sulla
        // stessa camera si concatena a questa promise e deve poter partire comunque.
        .catch((error) => env.logger.error(`Dispatch threw for "${cameraId}": ${String(error)}`)());

      queues.set(cameraId, run);
      return run.then(() => E.right(undefined));
    };

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
              TE.flatMap(() =>
                TE.sequenceSeqArray(
                  // Best-effort: un fallimento non deve far fallire l'intero reconcile (verrà
                  // ritentato al prossimo ciclo) - stesso helper usato dall'intent Disconnect.
                  stray.map((target) => Adb.disconnectQuietly(target)({ logger: adbLogger, spawn: env.spawn })),
                ),
              ),
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
      if (!states.has(id)) {
        states.set(id, AndroidBridge.disconnected(id, host, "not yet connected"));
      }
    }
    for (const id of states.keys()) {
      if (!controlledHosts.has(id)) {
        states.delete(id);
        queues.delete(id);
      }
    }

    const toRetry = Array.from(states.entries()).filter(([, state]) => state._tag === "Disconnected");

    return pipe(TE.sequenceSeqArray(toRetry.map(([id]) => dispatchTo(id, { _tag: "ReconnectRequested" }))), TE.asUnit);
  };

  const accepts = (cameraId: string): boolean => {
    const state = states.get(cameraId);
    return state !== undefined && AndroidBridge.acceptsCommands(state);
  };

  // Liveness-detection: `isReachable` è un controllo sui dati del poll, non logica di macchina -
  // resta qui. La pertinenza dell'evento (solo una camera Idle può "perdersi") la decide il
  // reducer, quindi non serve pre-filtrare sullo stato oltre a quanto serve per leggere il target.
  const unsubscribe = adbDeviceStream.subscribe((devices) => {
    for (const [id, state] of states) {
      if (state._tag !== "Idle" || isReachable(state.target)(devices)) continue;

      void dispatchTo(id, { _tag: "ConnectionLost", reason: "Device no longer reachable via ADB" })();
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
    dispatch: dispatchTo,
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
