import type * as Activity from "@supervisor/core/activity/stream";
import * as Adb from "@supervisor/core/adapters/adb/shell";
import * as Config from "@supervisor/core/config";
import * as Db from "@supervisor/core/db";
import type * as LogStream from "@supervisor/core/logger/log-stream";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import type * as Notify from "@supervisor/core/notify/stream";
import type * as Predicates from "@supervisor/core/predicates/index";
import type * as Recovery from "@supervisor/core/recovery/index";
import type * as Trpc from "@supervisor/core/trpc";
import type * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import { pipe } from "fp-ts/function";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import type * as AdbStream from "./adb/adb-stream";
import * as Node from "./node";

const toDeviceSnapshot = (devices: readonly Adb.Device[]): readonly Trpc.AndroidDeviceSnapshot[] =>
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
  readonly activityStream: Activity.ActivityFeed;
  readonly resetRecovery: (policyLabel: string, entityId: string, tripwireIndex: number) => boolean;
  readonly runManualWorkflow: (
    cameraId: string,
    workflowName: string,
  ) => TE.TaskEither<WorkflowInterpreter.WorkflowError, void>;
};

export const create = ({
  config,
  trpcLog,
  adbDeviceStream,
  logStream,
  predicateStream,
  recoveryStream,
  notifyStream,
  activityStream,
  resetRecovery,
  runManualWorkflow,
}: Deps): Trpc.Services => ({
  logger: trpcLog.child("web"),
  android: android(trpcLog, adbDeviceStream),
  notifications: notifyStream,
  activity: activityStream,
  registry: registry(config.registry.dbPath),

  // Già redatta - mai esporre credenziali raw
  settings: {
    getConfig: () => Config.redact(config),
  },

  logs: logStream,
  tracking: predicateStream,
  recovery: recoveryStream,
  recoveryReset: resetRecovery,
  runWorkflow: runManualWorkflow,
});

const android = (trpcLog: Logger.Tagged, stream: AdbStream.AdbDeviceStream): Trpc.Services["android"] => ({
  devices: () => pipe(Adb.devices({ logger: trpcLog, spawn: Node.spawn }), TE.map(toDeviceSnapshot)),
  reboot: (target) => Adb.reboot(target)({ logger: trpcLog, spawn: Node.spawn }),

  // Alimentato dal tracker centralizzato: evita che questo feed ripolli `adb devices` per conto proprio
  devicesFeed: {
    subscribe: (listener) => stream.subscribe((devices) => listener(toDeviceSnapshot(devices))),
    snapshot: () => toDeviceSnapshot(stream.snapshot()),
  },
});

const registry = (dbPath: string): Trpc.Services["registry"] => ({
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
