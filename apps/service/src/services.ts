import * as Config from "@supervisor/core/config";
import type * as LogStream from "@supervisor/core/log-stream";
import type * as Logger from "@supervisor/core/logger";
import * as Network from "@supervisor/core/network";
import type * as Notify from "@supervisor/core/notify/stream";
import type * as Predicates from "@supervisor/core/predicates/index";
import type * as Recovery from "@supervisor/core/recovery/index";
import * as Adb from "@supervisor/core/services/adb";
import * as Db from "@supervisor/core/services/db";
import type * as Services from "@supervisor/core/services/services";
import { pipe } from "fp-ts/function";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import type * as AdbStream from "./adb/adb-stream";
import * as Node from "./node";

const toDeviceSnapshot = (devices: readonly Adb.Device[]): readonly Services.AndroidDeviceSnapshot[] =>
  pipe(
    devices,
    RA.map((device) => ({
      ...device,
      target: Network.format(device.target),
    })),
  );

export type Deps = {
  readonly config: Config.Service;
  readonly trpcLog: Logger.Tagged;
  readonly logStream: LogStream.LogStream;
  readonly adbDeviceStream: AdbStream.AdbDeviceStream;
  readonly predicateStream: Predicates.PredicateFeed;
  readonly recoveryStream: Recovery.RecoveryFeed;
  readonly notifyStream: Notify.NotifyFeed;
};

export const createServices = ({
  config,
  trpcLog,
  adbDeviceStream,
  logStream,
  predicateStream,
  recoveryStream,
  notifyStream,
}: Deps): Services.Services => ({
  // Servizio di logging persistente per web-app
  logger: trpcLog.child("web"),

  // Servizio di gestione delle dispositivi android
  android: android(trpcLog, adbDeviceStream),

  // TODO: Servizio di DNS-SD (Service Discovery)
  mdns: {},

  // Feed live delle notifiche dispatchate dal motore di recovery
  notifications: notifyStream,

  // Servizio di gestione del registry dei device
  registry: registry(config.registry.dbPath),

  // Config di servizio in sola lettura (già redatta - mai esporre credenziali raw)
  settings: {
    getConfig: () => Config.redact(config),
  },

  // tRPC (consumati dalle subscriptions per la web-app)

  // Feed live dei log di servizio
  logs: logStream,
  // Feed live dei predicati di monitoring
  tracking: predicateStream,
  // Feed live delle transizioni di stato del motore di recovery
  recovery: recoveryStream,
});

const android = (trpcLog: Logger.Tagged, stream: AdbStream.AdbDeviceStream): Services.AndroidBridge => ({
  // Recupera la lista dei device connessi tramite ADB
  devices: () => pipe(Adb.devices({ logger: trpcLog, spawn: Node.spawn }), TE.map(toDeviceSnapshot)),

  // Riavvia un device tramite ADB
  reboot: (target) => Adb.reboot(target)({ logger: trpcLog, spawn: Node.spawn }),

  // Live feed dei device ADB alimentato dal tracker centralizzato (apps/service/src/tracking/adb):
  // consolidato qui per evitare che `android.devicesTail` ripolli `adb devices` per conto proprio
  devicesFeed: {
    subscribe: (listener) => stream.subscribe((devices) => listener(toDeviceSnapshot(devices))),
    snapshot: () => toDeviceSnapshot(stream.snapshot()),
  },
});

const registry = (dbPath: string): Services.DeviceRegistry => ({
  getAll: () => Db.read(dbPath)(Node.fsEnv),

  candyboxes: {
    update: ({ id, ...update }: Db.CandyboxUpdateInput) =>
      Db.modifyLab(dbPath)(Db.updateCandyboxById(id, update))(Node.fsEnv),

    add: (entry: Db.CandyboxEntry) => Db.modifyLab(dbPath)(Db.addCandybox(entry))(Node.fsEnv),

    remove: (id: string) => Db.modifyLab(dbPath)(Db.removeCandyboxById(id))(Node.fsEnv),
  },

  cameras: {
    update: ({ id, ...update }: Db.CameraUpdateInput) =>
      Db.modifyLab(dbPath)(Db.updateCameraById(id, update))(Node.fsEnv),

    add: (entry: Db.CameraEntry) => Db.modifyLab(dbPath)(Db.addCamera(entry))(Node.fsEnv),

    remove: (id: string) => Db.modifyLab(dbPath)(Db.removeCameraById(id))(Node.fsEnv),
  },

  tvs: {
    update: ({ deviceId, ...update }: Db.TvUpdateInput) =>
      Db.modifyLab(dbPath)(Db.updateTvByDeviceId(deviceId, update))(Node.fsEnv),

    add: (entry: Db.TvEntry) => Db.modifyLab(dbPath)(Db.addTv(entry))(Node.fsEnv),

    remove: (deviceId: string) => Db.modifyLab(dbPath)(Db.removeTvByDeviceId(deviceId))(Node.fsEnv),
  },

  adb: {
    update: ({ id, ...update }: Db.AdbUpdateInput) =>
      Db.modifyLab(dbPath)(Db.updateAdbEntryById(id, update))(Node.fsEnv),

    add: (entry: Db.AdbEntry) => Db.modifyLab(dbPath)(Db.addAdbEntry(entry))(Node.fsEnv),

    remove: (id: string) => Db.modifyLab(dbPath)(Db.removeAdbEntryById(id))(Node.fsEnv),
  },
});
