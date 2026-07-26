import * as Network from "@supervisor/core/network";
import type { CameraEntry, LabRegistry } from "@supervisor/core/services/db";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";

// -------------------------------------------------------------------------------------
// Gating: quali host ADB il discovery/connection deve considerare
// -------------------------------------------------------------------------------------

// Risolve la foreign key `adbId` nel registro `lab.adb` per ottenere il target ADB associato
const resolveAdbTarget =
  (registry: LabRegistry) =>
  (camera: CameraEntry): O.Option<Network.Endpoint> =>
    pipe(
      camera.adbId,
      O.chain((id) => O.fromNullable(registry.adb[id])),
      O.map((entry) => entry.target),
    );

const resolveAdbHost =
  (registry: LabRegistry) =>
  (camera: CameraEntry): O.Option<string> =>
    pipe(
      resolveAdbTarget(registry)(camera),
      O.map((target) => target.ip),
    );

// Host ADB dei device marcati come controllati (usato per il gating del recovery)
export const controlledCameraHosts = (registry: LabRegistry): readonly string[] =>
  pipe(
    Object.values(registry.cameras),
    RA.filter((d) => d.controlled),
    RA.filterMap(resolveAdbHost(registry)),
  );

// Host ADB di tutte le camere note in registry, controllate o meno - usato per distinguere un
// device "nostro" ma non (più) controllato da uno completamente esterno al registry
export const cameraHosts = (registry: LabRegistry): readonly string[] =>
  pipe(Object.values(registry.cameras), RA.filterMap(resolveAdbHost(registry)));

// (id camera -> host ADB) delle camere controllate - usato per istanziare/ritentare le FSM
// android-bridge all'avvio e ad ogni tick di reconcile (machines/android-bridge/orchestrator.ts).
// Solo l'IP (non la porta registrata, che può essere stale): la connessione effettiva risolve
// di nuovo la porta corrente via mDNS (target-resolution.ts).
export const controlledCameraHostsById = (registry: LabRegistry): ReadonlyMap<string, Network.Host> =>
  new Map(
    pipe(
      Object.values(registry.cameras),
      RA.filter((d) => d.controlled),
      RA.filterMap(
        (camera): O.Option<readonly [string, Network.Host]> =>
          pipe(
            resolveAdbTarget(registry)(camera),
            O.map((target): readonly [string, Network.Host] => [camera.id, Network.host(target.ip)]),
          ),
      ),
    ),
  );
