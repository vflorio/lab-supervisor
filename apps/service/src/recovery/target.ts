import type * as Db from "@supervisor/core/db";
import * as Network from "@supervisor/core/network";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import { match } from "ts-pattern";
import * as AndroidBridge from "../android-bridge/tracking";
import * as SuitestCamera from "../suitest/suitest-camera";

// Risolve l'entityId di un dominio tracciato nel Network.Endpoint ADB per i Commands
// di una pipeline di recovery. La porta non è mai quella salvata nel registry (che tiene solo
// l'IP): per il dominio "adb" arriva dal target live tracciato (già ip:port), per
// "suitest-camera" dalla config globale `adb.port`, unica sorgente di verità sulla porta.

export const resolveTarget = (
  domain: string,
  entityId: string,
  registry: Db.LabRegistry,
  adbPort: Network.PORT,
): O.Option<Network.Endpoint> =>
  match(domain)
    .with(AndroidBridge.DOMAIN, () => O.fromEither(Network.decode(entityId)))
    .with(SuitestCamera.DOMAIN, () => resolveCameraTarget(entityId, registry, adbPort))
    .otherwise(() => O.none);

const findCameraByVideoCaptureDeviceId = (
  videoCaptureDeviceId: string,
  registry: Db.LabRegistry,
): O.Option<Db.CameraEntry> =>
  pipe(
    Object.values(registry.cameras),
    RA.findFirst((camera) => O.elem(S.Eq)(videoCaptureDeviceId)(camera.videoCaptureDeviceId)),
  );

const resolveCameraTarget = (
  videoCaptureDeviceId: string,
  registry: Db.LabRegistry,
  adbPort: Network.PORT,
): O.Option<Network.Endpoint> =>
  pipe(
    findCameraByVideoCaptureDeviceId(videoCaptureDeviceId, registry),
    O.chain((camera) => camera.adbId),
    O.chain((adbId) => O.fromNullable(registry.adb[adbId])),
    O.map((entry) => Network.of(entry.target.ip, adbPort)),
  );

// Trova la camera il cui host ADB assegnato ha questo IP - a differenza di `registry.adb[id]`,
// qui la chiave del registro (opaca) non c'entra: il dominio "adb" è tracciato via `adb
// devices`, che conosce solo l'indirizzo IP effettivo, non l'id assegnato in fase di
// associazione.
const findCameraByAdbIp = (ip: Network.IP, registry: Db.LabRegistry): O.Option<Db.CameraEntry> =>
  pipe(
    Object.values(registry.cameras),
    RA.findFirst((camera) =>
      pipe(
        camera.adbId,
        O.chain((adbId) => O.fromNullable(registry.adb[adbId])),
        O.exists((entry) => Network.EqIP.equals(entry.target.ip, ip)),
      ),
    ),
  );

// Risolve l'entityId di un dominio tracciato nell'id camera usato dall'AndroidBridge
// (chiave = CameraEntry.id) - a differenza di resolveTarget, che dà l'endpoint ADB, qui serve
// l'identità stabile locale per interrogare acceptsCommands/awaitIdle.

export const resolveAndroidBridgeId = (domain: string, entityId: string, registry: Db.LabRegistry): O.Option<string> =>
  match(domain)
    // Dominio "adb": l'entityId è Network.format(target) (ip:port live) - si risale alla
    // camera confrontando l'IP con quello registrato per il suo adbId.
    .with(AndroidBridge.DOMAIN, () =>
      pipe(
        O.fromEither(Network.decode(entityId)),
        O.chain((endpoint) => findCameraByAdbIp(endpoint.ip, registry)),
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
    .with(AndroidBridge.DOMAIN, () =>
      pipe(
        O.fromEither(Network.decode(entityId)),
        O.chain((endpoint) => findCameraByAdbIp(endpoint.ip, registry)),
        O.map((camera) => camera.label),
      ),
    )
    .with(SuitestCamera.DOMAIN, () =>
      pipe(
        findCameraByVideoCaptureDeviceId(entityId, registry),
        O.map((camera) => camera.label),
      ),
    )
    .otherwise(() => O.none);

export const describeEntity = (
  domain: string,
  entityId: string,
  registry: Db.LabRegistry,
  adbPort: Network.PORT,
): EntityDescriptor => ({
  id: entityId,
  label: O.getOrElse(() => entityId)(resolveLabel(domain, entityId, registry)),
  ip: O.getOrElse(() => UNKNOWN)(pipe(resolveTarget(domain, entityId, registry, adbPort), O.map(Network.format))),
});
