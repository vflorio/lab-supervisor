import * as Errors from "@supervisor/core/errors";
import * as Network from "@supervisor/core/network";
import * as Adb from "@supervisor/core/services/adb";
import type { LabRegistry } from "@supervisor/core/services/db";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as ConnectionGating from "../../gating";
import type { AdbDeviceFeed } from "../../tracking/adb-stream";
import type { AndroidBridgeMachineEnv } from "./interpret";
import * as AndroidBridgeMachine from "./machine";
import * as AndroidBridge from "./model";

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
  readonly reconcile: (registry: LabRegistry) => TE.TaskEither<never, void>;
  readonly acceptsCommands: (cameraId: string) => boolean;
  readonly snapshot: () => ReadonlyMap<string, AndroidBridge.AndroidBridgeState>;
  readonly stop: () => void;
}

const isReachable =
  (target: Network.Endpoint) =>
  (devices: readonly Adb.Device[]): boolean =>
    devices.some((d) => d.status === "device" && Network.EqByIp.equals(d.target, target));

export const create = (env: AndroidBridgeMachineEnv, adbDeviceStream: AdbDeviceFeed): Handle => {
  const states = new Map<string, AndroidBridge.AndroidBridgeState>();

  // Best-effort: un fallimento in disconnessione non deve far fallire l'intero reconcile,
  // si logga soltanto (verrà ritentato al prossimo ciclo)
  const disconnectStray = (target: Network.Endpoint): TE.TaskEither<never, void> =>
    pipe(
      Adb.disconnect(target)({ logger: env.logger.child("ADB"), spawn: env.spawn }),
      TE.orElse((error) => {
        env.logger.error(`Failed to disconnect uncontrolled host ${Network.format(target)}: ${Errors.format(error)}`)();
        return TE.right<never, void>(undefined);
      }),
    );

  // Host noti al registry ma non (più) controllati -> disconnessi. Un host del tutto esterno
  // al registry viene ignorato (potrebbe non essere nostro)
  const reconcileStray = (registry: LabRegistry): TE.TaskEither<never, void> => {
    const knownHosts = ConnectionGating.cameraHosts(registry);
    const controlledHosts = new Set(ConnectionGating.controlledCameraHosts(registry));

    const stray = adbDeviceStream
      .snapshot()
      .filter((d) => d.status === "device")
      .filter((d) => knownHosts.includes(d.target.ip) && !controlledHosts.has(d.target.ip))
      .map((d) => d.target);

    if (stray.length === 0) return TE.right(undefined);

    env.logger.info(`Disconnecting known-but-uncontrolled hosts: ${stray.map((t) => Network.format(t)).join(", ")}`)();

    return pipe(TE.sequenceSeqArray(stray.map(disconnectStray)), TE.asUnit);
  };

  // Aggiunge le camere appena diventate controlled (Disconnected, pronte al primo reconnect),
  // rimuove quelle non più controlled (il loro eventuale host resta gestito da reconcileStray),
  // e ritenta la connessione di ogni istanza attualmente Disconnected. Sequenziale (1 alla
  // volta) per non aprire connessioni ADB in parallelo, stessa convenzione di discovery.ts.
  const reconcileControlled = (controlledHosts: ReadonlyMap<string, Network.Host>): TE.TaskEither<never, void> => {
    for (const [id, host] of controlledHosts) {
      if (!states.has(id)) states.set(id, AndroidBridge.disconnected(id, host, "not yet connected"));
    }
    for (const id of states.keys()) {
      if (!controlledHosts.has(id)) states.delete(id);
    }

    const toRetry = Array.from(states.entries()).filter(([, state]) => state._tag === "Disconnected");

    return pipe(
      TE.sequenceSeqArray(
        toRetry.map(
          ([id, state]): TE.TaskEither<never, void> =>
            pipe(
              AndroidBridgeMachine.dispatch(state, { _tag: "ReconnectRequested" })(env),
              TE.map((next) => {
                states.set(id, next);
              }),
            ),
        ),
      ),
      TE.asUnit,
    );
  };

  const unsubscribe = adbDeviceStream.subscribe((devices) => {
    for (const [id, state] of states) {
      if (state._tag !== "Idle" || isReachable(state.target)(devices)) continue;

      AndroidBridgeMachine.dispatch(state, {
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
        reconcileControlled(ConnectionGating.controlledCameraHostsById(registry)),
        TE.flatMap(() => reconcileStray(registry)),
      ),
    acceptsCommands: (cameraId) => {
      const state = states.get(cameraId);
      return state !== undefined && AndroidBridge.acceptsCommands(state);
    },
    snapshot: () => new Map(states),
    stop: unsubscribe,
  };
};
