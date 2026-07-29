import type * as Db from "@supervisor/core/db";
import * as Network from "@supervisor/core/network";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import { match } from "ts-pattern";
import * as AdbTracking from "../adb/adb-tracking";
import * as SuitestCamera from "../suitest/suitest-camera";

// Risolve l'entityId di un dominio tracciato nel Network.Endpoint ADB per le CommandCapabilities
// di una pipeline di recovery. Pura, nessun I/O; un dominio non ancora ADB-capable ritorna
// semplicemente O.none, non un errore.

export const resolveTarget = (domain: string, entityId: string, registry: Db.LabRegistry): O.Option<Network.Endpoint> =>
  match(domain)
    // Dominio "adb": l'entityId è già Network.format(target)
    .with(AdbTracking.DOMAIN, () => O.fromEither(Network.decode(entityId)))
    // Dominio "suitest-camera": l'entityId è il videoCaptureDeviceId Suitest, risolto via
    // CameraEntry.videoCaptureDeviceId -> CameraEntry.adbId -> registry.adb[adbId].target
    .with(SuitestCamera.DOMAIN, () => resolveCameraTarget(entityId, registry))
    .otherwise(() => O.none);

const findCameraByVideoCaptureDeviceId = (
  videoCaptureDeviceId: string,
  registry: Db.LabRegistry,
): O.Option<Db.CameraEntry> =>
  pipe(
    Object.values(registry.cameras),
    RA.findFirst((camera) => O.elem(S.Eq)(videoCaptureDeviceId)(camera.videoCaptureDeviceId)),
  );

const resolveCameraTarget = (videoCaptureDeviceId: string, registry: Db.LabRegistry): O.Option<Network.Endpoint> =>
  pipe(
    findCameraByVideoCaptureDeviceId(videoCaptureDeviceId, registry),
    O.chain((camera) => camera.adbId),
    O.chain((adbId) => O.fromNullable(registry.adb[adbId])),
    O.map((entry) => entry.target),
  );

const findCameraByAdbId = (adbId: string, registry: Db.LabRegistry): O.Option<Db.CameraEntry> =>
  pipe(
    Object.values(registry.cameras),
    RA.findFirst((camera) => O.elem(S.Eq)(adbId)(camera.adbId)),
  );

// Risolve l'entityId di un dominio tracciato nell'id camera usato dall'AndroidBridgeOrchestrator
// (chiave = CameraEntry.id) - a differenza di resolveTarget, che dà l'endpoint ADB, qui serve
// l'identità stabile locale per interrogare acceptsCommands/awaitIdle.

export const resolveAndroidBridgeId = (domain: string, entityId: string, registry: Db.LabRegistry): O.Option<string> =>
  match(domain)
    // Dominio "adb": l'entityId è Network.format(target) == la stessa chiave di registry.adb[adbId]
    .with(AdbTracking.DOMAIN, () =>
      pipe(
        findCameraByAdbId(entityId, registry),
        O.map((camera) => camera.id),
      ),
    )
    .with(SuitestCamera.DOMAIN, () =>
      pipe(
        findCameraByVideoCaptureDeviceId(entityId, registry),
        O.map((camera) => camera.id),
      ),
    )
    .otherwise(() => O.none);

// Descrive un'entità per i placeholder di un messaggio di notifica: stesso `match` su domain
// di resolveTarget, ma per label leggibile + ip. Un lookup non risolvibile ricade sul solo
// entityId - una notifica non deve mai fallire per un dettaglio del device mancante.

export interface EntityDescriptor {
  readonly id: string;
  readonly label: string;
  readonly ip: string;
}

const UNKNOWN = "unknown";

const resolveLabel = (domain: string, entityId: string, registry: Db.LabRegistry): O.Option<string> =>
  match(domain)
    .with(AdbTracking.DOMAIN, () => O.fromNullable(registry.adb[entityId]?.label))
    .with(SuitestCamera.DOMAIN, () =>
      pipe(
        findCameraByVideoCaptureDeviceId(entityId, registry),
        O.map((camera) => camera.label),
      ),
    )
    .otherwise(() => O.none);

export const describeEntity = (domain: string, entityId: string, registry: Db.LabRegistry): EntityDescriptor => ({
  id: entityId,
  label: O.getOrElse(() => entityId)(resolveLabel(domain, entityId, registry)),
  ip: O.getOrElse(() => UNKNOWN)(pipe(resolveTarget(domain, entityId, registry), O.map(Network.format))),
});
