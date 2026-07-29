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

// Cadenza di poll di `awaitIdle` su stato già in memoria (no I/O) - non configurabile,
// il tempo totale di attesa è `timeoutMs`, passato dal chiamante.
const AWAIT_IDLE_POLL_MS = 2000;

const awaitIdleTimeout = (cameraId: string, timeoutMs: number): Shell.CommandTimeoutError =>
  Errors.of("CommandTimeout")(`Timed out waiting for "${cameraId}" to become Idle after ${timeoutMs}ms`);

// Orchestrator: una FSM android-bridge per camera controlled. Due ingressi la aggiornano:
// il tick periodico di reconcile e la subscription su `adbDeviceStream`, che dispatcha
// ConnectionLost quando una camera Idle non è più raggiungibile.

export interface Handle {
  readonly reconcile: (registry: LabRegistry) => TE.TaskEither<Adb.Error, void>;
  readonly acceptsCommands: (cameraId: string) => boolean;
  // Unico modo per invalidare/avanzare lo stato di una camera; un evento non pertinente è no-op.
  // Err = never: i fallimenti diventano eventi, mai un Left.
  readonly dispatch: (cameraId: string, event: AndroidBridge.AndroidBridgeEvent) => TE.TaskEither<never, void>;
  // Polla lo stato già in memoria (no I/O) finché non torna Idle; scade con
  // CommandTimeoutError dopo `timeoutMs`, non fallisce per device ancora giù.
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

  // Coda per camera, unico punto di scrittura di `states`: serializza i dispatch concorrenti
  // sulla stessa camera (es. reconcile tick vs evento esterno) evitando che si sovrascrivano;
  // camere diverse restano parallele.
  const queues = new Map<string, Promise<void>>();

  const dispatchTo =
    (cameraId: string, event: AndroidBridge.AndroidBridgeEvent): TE.TaskEither<never, void> =>
    () => {
      const run = (queues.get(cameraId) ?? Promise.resolve())
        .then(async () => {
          const state = states.get(cameraId);
          // Camera non controlled: nessuna macchina a cui consegnare l'evento
          if (!state) return;

          const result = await AndroidBridge.dispatch(state, event)(env)();
          // Err = never: il ramo Left è irraggiungibile, resta come rete di sicurezza
          if (E.isRight(result)) states.set(cameraId, result.right);
          else env.logger.error(`Dispatch failed for "${cameraId}": ${Errors.format(result.left)}`)();
        })
        // Evita che un rejection avveleni la coda: il prossimo dispatch deve poter partire comunque.
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
                  // Best-effort: un fallimento qui non deve far fallire l'intero reconcile.
                  stray.map((target) => Adb.disconnectQuietly(target)({ logger: adbLogger, spawn: env.spawn })),
                ),
              ),
            )
          : TE.right(undefined),
      ),
      TE.asUnit,
    );

  // Allinea le istanze alle camere controlled correnti e ritenta le Disconnected, una alla
  // volta (no connessioni ADB in parallelo).
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

  // Liveness-detection sui dati del poll; la pertinenza dell'evento la decide comunque il reducer.
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
      // Già Idle: nessuna attesa, nessun evento activity (caso comune)
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
