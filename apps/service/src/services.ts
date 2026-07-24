import * as ConfigModel from "@supervisor/core/config";
import type * as LogStream from "@supervisor/core/log-stream";
import type * as Logger from "@supervisor/core/logger";
import * as NetworkTarget from "@supervisor/core/network-target";
import type * as Predicates from "@supervisor/core/predicates/index";
import * as Adb from "@supervisor/core/services/adb";
import * as Db from "@supervisor/core/services/db";
import type { Services } from "@supervisor/core/services/services";
import { pipe } from "fp-ts/function";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import * as Node from "./node";
import type * as Tracking from "./tracking";

export const createServices = (
  config: ConfigModel.Service,
  trpcLog: Logger.Tagged,
  trackingHandle: Tracking.TrackingHandle,
  logStream: LogStream.LogStream,
  predicateStream: Predicates.PredicateFeed,
): Services => ({
  // Servizio di logging persistente per web-app
  logger: trpcLog.child("web"),

  // Feed live dei log di servizio, consumato dalla subscription tRPC per la web-app
  logs: logStream,

  // Feed live dei predicati di monitoring, consumato dalla subscription tRPC per la web-app
  tracking: predicateStream,

  // TODO: Servizi di gestione delle dispositivi android
  android: {
    // Recupera la lista dei device connessi tramite ADB
    devices: () =>
      pipe(
        Adb.devices({ logger: trpcLog, spawn: Node.spawn }),
        TE.map(
          RA.map((device) => ({
            ...device,
            target: NetworkTarget.format(device.target),
          })),
        ),
      ),

    // Riavvia un device tramite ADB
    reboot: (target) => Adb.reboot(target)({ logger: trpcLog, spawn: Node.spawn }),

    // Live feed dei device ADB alimentato dal tracker centralizzato (apps/service/src/tracking/adb):
    // consolidato qui per evitare che `android.devicesTail` ripolli `adb devices` per conto proprio
    devicesFeed: {
      subscribe: (listener) =>
        trackingHandle.adbDeviceFeed.subscribe((devices) =>
          listener(
            devices.map((device) => ({
              ...device,
              target: NetworkTarget.format(device.target),
            })),
          ),
        ),

      snapshot: () =>
        trackingHandle.adbDeviceFeed.snapshot().map((device) => ({
          ...device,
          target: NetworkTarget.format(device.target),
        })),
    },
  },

  // TODO: Servizio di DNS-SD (Service Discovery)
  mdns: {},

  // TODO: Servizio di notifiche
  notifications: {},

  // Servizio di gestione del registry dei device
  registry: {
    // Recupera l'intero db (mirror Suitest + dominio applicativo)
    getAll: () => Db.read(config.registry.dbPath)(Node.fsEnv),

    candyboxes: {
      update: ({ id, ...update }: Db.CandyboxUpdateInput) =>
        Db.modifyLab(config.registry.dbPath)(Db.updateCandyboxById(id, update))(Node.fsEnv),

      add: (entry: Db.CandyboxEntry) => Db.modifyLab(config.registry.dbPath)(Db.addCandybox(entry))(Node.fsEnv),

      remove: (id: string) => Db.modifyLab(config.registry.dbPath)(Db.removeCandyboxById(id))(Node.fsEnv),
    },

    cameras: {
      update: ({ id, ...update }: Db.CameraUpdateInput) =>
        Db.modifyLab(config.registry.dbPath)(Db.updateCameraById(id, update))(Node.fsEnv),

      add: (entry: Db.CameraEntry) => Db.modifyLab(config.registry.dbPath)(Db.addCamera(entry))(Node.fsEnv),

      remove: (id: string) => Db.modifyLab(config.registry.dbPath)(Db.removeCameraById(id))(Node.fsEnv),
    },

    tvs: {
      update: ({ deviceId, ...update }: Db.TvUpdateInput) =>
        Db.modifyLab(config.registry.dbPath)(Db.updateTvByDeviceId(deviceId, update))(Node.fsEnv),

      add: (entry: Db.TvEntry) => Db.modifyLab(config.registry.dbPath)(Db.addTv(entry))(Node.fsEnv),

      remove: (deviceId: string) => Db.modifyLab(config.registry.dbPath)(Db.removeTvByDeviceId(deviceId))(Node.fsEnv),
    },

    adb: {
      update: ({ id, ...update }: Db.AdbUpdateInput) =>
        Db.modifyLab(config.registry.dbPath)(Db.updateAdbEntryById(id, update))(Node.fsEnv),

      add: (entry: Db.AdbEntry) => Db.modifyLab(config.registry.dbPath)(Db.addAdbEntry(entry))(Node.fsEnv),

      remove: (id: string) => Db.modifyLab(config.registry.dbPath)(Db.removeAdbEntryById(id))(Node.fsEnv),
    },
  },

  // Config di servizio in sola lettura (già redatta - mai esporre credenziali raw)
  settings: {
    getConfig: () => ConfigModel.redact(config),
  },
});
