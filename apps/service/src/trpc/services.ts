import type * as Activity from "@supervisor/core/activity/stream";
import * as Adb from "@supervisor/core/adapters/adb/shell";
import * as Config from "@supervisor/core/config";
import * as Db from "@supervisor/core/db";
import * as Errors from "@supervisor/core/errors";
import type * as Facts from "@supervisor/core/fact/index";
import type * as LogStream from "@supervisor/core/logger/log-stream";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import type * as Notify from "@supervisor/core/notify/stream";
import type * as Recovery from "@supervisor/core/recovery/index";
import type * as TaskRunner from "@supervisor/core/task-runner/index";
import type * as Trpc from "@supervisor/core/trpc";
import type * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import type * as AndroidBridge from "../android-bridge/runner";
import type * as ProvisioningRunner from "../android-provisioning/runner";
import * as Node from "../node";

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
  // `None` se la config è caricata da `--config-url`: `setConfig` non ha un file su cui persistere.
  readonly configPath: O.Option<string>;
  readonly trpcLog: Logger.Tagged;
  readonly logStream: LogStream.LogStream;
  readonly adbDeviceStream: AndroidBridge.AdbDeviceStream;
  readonly factStream: Facts.FactStream;
  readonly recoveryStream: Recovery.RecoveryFeed;
  readonly notifyStream: Notify.NotifyFeed;
  readonly activityStream: Activity.ActivityFeed;
  readonly loopStream: TaskRunner.LoopFeed;
  readonly provisioning: ProvisioningRunner.Handle;
  readonly resetRecovery: (policyLabel: string, entityId: string, tripwireIndex: number) => boolean;
  readonly runManualWorkflow: (
    cameraId: string,
    workflowName: string,
  ) => TE.TaskEither<WorkflowInterpreter.WorkflowError, void>;
};

export const create = ({
  config,
  configPath,
  trpcLog,
  adbDeviceStream,
  logStream,
  factStream,
  recoveryStream,
  notifyStream,
  activityStream,
  loopStream,
  provisioning,
  resetRecovery,
  runManualWorkflow,
}: Deps): Trpc.Services => {
  // In-memory soltanto: nessun writer su file, si perde al riavvio (vedi commento su
  // Trpc.Services["settings"]["updateActivationSchedule"]) - eccetto `setConfig`, che persiste
  // (vedi sotto).
  let currentConfig = config;

  return {
    logger: trpcLog.child("web"),
    android: android(trpcLog, adbDeviceStream),

    // I due metodi pubblicano lo stato letto come fatti del dominio `agent`, quindi qui non
    // c'è nulla da adattare: la UI lo riceve dal feed `tracking` come per ogni altro dominio.
    provisioning: {
      isConfigured: provisioning.isConfigured,
      refresh: (target) => pipe(provisioning.refresh(target), TE.asUnit),
      provision: (target) => pipe(provisioning.provision(target), TE.asUnit),
    },

    notifications: notifyStream,
    activity: activityStream,
    loops: loopStream,
    registry: registry(config.registry.dbPath),

    // Già redatta - mai esporre credenziali raw
    settings: {
      getConfig: () => Config.redact(currentConfig),
      updateActivationSchedule: (activationSchedule) => {
        currentConfig = { ...currentConfig, activationSchedule };
        return Config.redact(currentConfig);
      },
      updateWorkflows: (workflows) => {
        currentConfig = { ...currentConfig, workflows: [...workflows] };
        return Config.redact(currentConfig);
      },
      // Il cast rispecchia solo la variance readonly->mutable dell'array in input
      updateRecovery: (recovery) => {
        currentConfig = { ...currentConfig, recovery: recovery as Config.Service["recovery"] };
        return Config.redact(currentConfig);
      },
      // Endomorfismo: legge il file, applica il patch, riscrive solo i campi cambiati - fallisce se la config viene da URL.
      setConfig: (patch) =>
        pipe(
          configPath,
          O.match(
            () =>
              TE.left<Config.ConfigError | Errors.AppError, Config.Service>(
                Errors.of("ConfigWriteError")("Config caricata da --config-url: impossibile persistere su file"),
              ),
            (path) =>
              pipe(
                Config.modify(path)(Config.applyPatch(patch))(Node.fsEnv),
                TE.map((next) => {
                  currentConfig = next;
                  return Config.redact(next);
                }),
              ),
          ),
        ),
    },

    logs: logStream,
    tracking: factStream,
    recovery: recoveryStream,
    recoveryReset: resetRecovery,
    runWorkflow: runManualWorkflow,
  };
};

const android = (trpcLog: Logger.Tagged, stream: AndroidBridge.AdbDeviceStream): Trpc.Services["android"] => ({
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
