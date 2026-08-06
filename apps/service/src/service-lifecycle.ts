import type * as Activity from "@supervisor/core/activity/stream";
import type * as ConfigModel from "@supervisor/core/config";
import * as DateTime from "@supervisor/core/date-time";
import * as Errors from "@supervisor/core/errors";
import type * as Facts from "@supervisor/core/fact/index";
import type * as Logger from "@supervisor/core/logger/logger";
import type * as Notify from "@supervisor/core/notify/stream";
import type * as Recovery from "@supervisor/core/recovery/index";
import * as RetryCodec from "@supervisor/core/retry/codec";
import * as TaskRunner from "@supervisor/core/task-runner/index";
import type * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";
import * as AndroidBridge from "./android-bridge/runner";
import * as AndroidBridgeTracking from "./android-bridge/tracking";
import * as Node from "./node";
import type * as ProvisioningRunner from "./provisioning/runner";
import * as ProvisioningTracking from "./provisioning/tracking";
import * as RecoveryEngine from "./recovery/engine";
import * as Registry from "./registry";
import * as SuitestTracking from "./suitest/tracking";
import * as WorkflowManualRun from "./workflow-manual-run";

// Active Lifecycle: tutto ciò che esiste solo mentre il servizio è attivo secondo l'ActivationSchedule

export interface TrackingPolicies {
  readonly androidBridgeTrackingPolicy: RetryCodec.DescribedPolicy;
  readonly suitestCameraTrackingPolicy: RetryCodec.DescribedPolicy;
  readonly suitestControlUnitTrackingPolicy: RetryCodec.DescribedPolicy;
  readonly suitestDeviceTrackingPolicy: RetryCodec.DescribedPolicy;
  readonly agentTrackingPolicy: RetryCodec.DescribedPolicy;
}

export interface Env {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly policies: TrackingPolicies;
  // Fatti nominati e tipizzati (bool/string/number) sulle entità dei domini tracciati (adb/suitest-*): chiave (domain, entityId, name)
  readonly factStream: Facts.FactStream;
  // Lista completa dei device ADB correnti ad ogni cambiamento (snapshot intero, non delta)
  readonly adbDeviceStream: AndroidBridge.AdbDeviceStream;
  // Transizioni di stato di ogni tripwire di recovery (healthy/pending/recovering/exhausted/fatalError): chiave (policy, domain, entityId, tripwireIndex), con storico
  readonly recoveryStream: Recovery.RecoveryStream;
  // Notifiche puntuali verso l'esterno (Slack), una per regola valutata: evento singolo, senza snapshot
  readonly notifyStream: Notify.NotifyStream;
  // Cosa i sottosistemi (recovery/adb/workflow) stanno facendo sulle entità di dominio: una riga di stato per (source, entityId), con storico
  readonly activityStream: Activity.ActivityStream;
  // Heartbeat dei loop di background del TaskRunner: solo l'ultimo stato (running/idle/error/...) per ogni loop
  readonly loopStream: TaskRunner.LoopStream;
  // Creato fuori dal lifecycle (vive anche a servizio inattivo): qui serve solo la lettura
  // periodica dello stato, non l'azione manuale di provisioning
  readonly provisioning: ProvisioningRunner.Handle;
}

export interface ActiveLifecycle {
  readonly androidBridge: AndroidBridge.Handle;
  readonly androidBridgeTracking: TaskRunner.Handle;
  readonly suitestTracking: TaskRunner.Handle;
  readonly androidBridgeReconciler: TaskRunner.Handle;
  readonly provisioningTracking: TaskRunner.Handle;
  readonly recovery: RecoveryEngine.Handle;

  // Lancio manuale di un workflow (via tRPC)
  readonly runWorkflow: (
    cameraId: string,
    workflowName: string,
  ) => TE.TaskEither<WorkflowInterpreter.WorkflowError, void>;
}

export type CreateError = Registry.SyncError | RecoveryEngine.StartError;

const RECONCILE_POLICY = RetryCodec.describedConstant(DateTime.durationToMs("5s"));

const createAndroidBridgeReconciler = (env: Env, androidBridge: AndroidBridge.Handle): TaskRunner.Handle => {
  const reconcileLog = env.logger.child("AndroidBridge");

  const onTick: TE.TaskEither<Errors.AppError, string | undefined> = pipe(
    Registry.read({
      logger: env.logger.child("Registry"),
      suitestConfig: env.config.suitest,
      dbPath: env.config.registry.dbPath,
      seedDevices: env.config.registry.devices,
      fsEnv: Node.fsEnv,
    }),
    TE.orElseFirstIOK((error) => reconcileLog.error(`registry read failed - ${Errors.format(error)}`)),
    TE.flatMap((registry) =>
      pipe(
        androidBridge.reconcile(registry.lab),
        TE.orElseFirstIOK((error) => reconcileLog.error(`reconcile failed: ${Errors.format(error)}`)),
      ),
    ),
    TE.map(() => undefined),
  );

  return TaskRunner.create({
    logger: reconcileLog,
    descriptor: {
      id: "android-bridge:reconcile",
      label: "Android Bridge - Reconcile",
      policyLabel: RECONCILE_POLICY.label,
    },
    policy: RECONCILE_POLICY.policy,
    onTick,
    loopStream: env.loopStream,
  });
};

const createRecovery = (
  env: Env,
  resources: Omit<ActiveLifecycle, "recovery" | "runWorkflow">,
): TE.TaskEither<CreateError, ActiveLifecycle> =>
  pipe(
    RecoveryEngine.start({
      logger: env.logger.child("Recovery"),
      config: env.config,
      factStream: env.factStream,
      recoveryStream: env.recoveryStream,
      notifyStream: env.notifyStream,
      activityStream: env.activityStream,
      loopStream: env.loopStream,
      androidBridge: resources.androidBridge,
    }),
    TE.fromEither,
    TE.map(
      (recovery): ActiveLifecycle => ({
        ...resources,
        recovery,
        runWorkflow: WorkflowManualRun.run({
          logger: env.logger.child("ManualWorkflow"),
          workflows: env.config.workflows,
          capabilitiesEnv: recovery.capabilitiesEnv,
          activityStream: env.activityStream,
          factStream: env.factStream,
        }),
      }),
    ),
  );

const createResources =
  (env: Env): IO.IO<Omit<ActiveLifecycle, "recovery" | "runWorkflow">> =>
  () => {
    const trackingLog = env.logger.child("Tracking");

    const androidBridge = AndroidBridge.create(
      {
        logger: env.logger.child("AndroidBridge"),
        spawn: Node.spawn,
        adbPort: env.config.adb.port,
        activityStream: env.activityStream,
      },
      env.adbDeviceStream,
    );

    const androidBridgeReconciler = createAndroidBridgeReconciler(env, androidBridge);

    const androidBridgeTracking = AndroidBridgeTracking.create({
      logger: trackingLog,
      factStream: env.factStream,
      adbDeviceStream: env.adbDeviceStream,
      adbEnv: { logger: trackingLog.child("Tracker-ADB"), spawn: Node.spawn },
      policy: env.policies.androidBridgeTrackingPolicy.policy,
      descriptor: {
        id: "tracker:android-bridge",
        label: "Android Bridge - Tracking",
        policyLabel: env.policies.androidBridgeTrackingPolicy.label,
      },
      loopStream: env.loopStream,
    });

    const suitestTracking = SuitestTracking.create({
      logger: trackingLog,
      suitestConfig: env.config.suitest,
      stream: env.factStream,
      policies: {
        suitestCamera: env.policies.suitestCameraTrackingPolicy,
        suitestControlUnit: env.policies.suitestControlUnitTrackingPolicy,
        suitestDevice: env.policies.suitestDeviceTrackingPolicy,
      },
      loopStream: env.loopStream,
    });

    const provisioningTracking = ProvisioningTracking.create({
      logger: trackingLog,
      runner: env.provisioning,
      adbDeviceStream: env.adbDeviceStream,
      policy: env.policies.agentTrackingPolicy.policy,
      descriptor: {
        id: "tracker:agent",
        label: "Agent - Provisioning status",
        policyLabel: env.policies.agentTrackingPolicy.label,
      },
      loopStream: env.loopStream,
    });

    return { androidBridge, androidBridgeTracking, suitestTracking, androidBridgeReconciler, provisioningTracking };
  };

const startBackgroundTasks = ({
  androidBridgeTracking,
  suitestTracking,
  androidBridgeReconciler,
  provisioningTracking,
}: ActiveLifecycle): IO.IO<void> =>
  TaskRunner.detach(
    pipe(
      [suitestTracking.start, androidBridgeTracking.start, androidBridgeReconciler.start, provisioningTracking.start],
      TE.traverseArray(flow(TaskRunner.detach, TE.fromIO)),
    ),
  );

const stopResources = ({
  androidBridgeTracking,
  suitestTracking,
  androidBridge,
  androidBridgeReconciler,
  provisioningTracking,
  recovery,
}: ActiveLifecycle): IO.IO<void> =>
  pipe(
    IO.Do,
    IO.flatMap(() => recovery.stop),
    IO.flatMap(() => androidBridgeTracking.stop),
    IO.flatMap(() => suitestTracking.stop),
    IO.flatMap(() => androidBridgeReconciler.stop),
    IO.flatMap(() => provisioningTracking.stop),
    IO.flatMap(() => androidBridge.stop),
  );

export const createActiveLifecycle = (env: Env): TE.TaskEither<CreateError, ActiveLifecycle> =>
  pipe(
    Registry.sync({
      logger: env.logger.child("Registry"),
      suitestConfig: env.config.suitest,
      dbPath: env.config.registry.dbPath,
      seedDevices: env.config.registry.devices,
      fsEnv: Node.fsEnv,
    }),
    TE.tapIO(() => env.logger.info("Activation flow completed")),
    TE.flatMap(() => TE.fromIO(createResources(env))),
    TE.flatMap((resources) => createRecovery(env, resources)),
    TE.tapIO(startBackgroundTasks),
  );

export const deactivateActiveLifecycle = (lifecycle: ActiveLifecycle): IO.IO<void> => stopResources(lifecycle);
