import * as Network from "@supervisor/core/network";
import type * as Db from "@supervisor/core/services/db";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import { match } from "ts-pattern";
import * as AdbTracking from "../adb/adb-tracking";
import * as SuitestCamera from "../suitest/suitest-camera";

// -------------------------------------------------------------------------------------
// Risolve l'entityId di un dominio tracciato (packages/core/src/predicates) nel Network.Endpoint
// ADB da usare per le CommandCapabilities di una pipeline di recovery. Pura funzione contro un
// LabRegistry già letto dal chiamante (nessun I/O qui) - un dominio non ancora ADB-capable
// (TV/candybox, vedi TODO) ritorna semplicemente O.none, non un errore di programma.
// -------------------------------------------------------------------------------------

export const resolveTarget = (domain: string, entityId: string, registry: Db.LabRegistry): O.Option<Network.Endpoint> =>
  match(domain)
    // Dominio "adb": l'entityId è già Network.format(target) (vedi adb-tracking.ts:keyOf)
    .with(AdbTracking.DOMAIN, () => O.fromEither(Network.decode(entityId)))
    // Dominio "suitest-camera": l'entityId è il videoCaptureDeviceId Suitest, risolto via
    // CameraEntry.videoCaptureDeviceId -> CameraEntry.adbId -> registry.adb[adbId].target
    .with(SuitestCamera.DOMAIN, () => resolveCameraTarget(entityId, registry))
    .otherwise(() => O.none);

const resolveCameraTarget = (videoCaptureDeviceId: string, registry: Db.LabRegistry): O.Option<Network.Endpoint> =>
  pipe(
    Object.values(registry.cameras),
    RA.findFirst((camera) => O.elem(S.Eq)(videoCaptureDeviceId)(camera.videoCaptureDeviceId)),
    O.chain((camera) => camera.adbId),
    O.chain((adbId) => O.fromNullable(registry.adb[adbId])),
    O.map((entry) => entry.target),
  );
