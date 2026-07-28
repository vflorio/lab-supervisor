import type * as Activity from "@supervisor/core/activity/stream";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as IntervalLoop from "@supervisor/core/interval-loop";
import type * as Logger from "@supervisor/core/logger/logger";
import type * as Notify from "@supervisor/core/notify/stream";
import type * as Predicates from "@supervisor/core/predicates/index";
import type * as Recovery from "@supervisor/core/recovery/index";
import type * as RetryPolicy from "@supervisor/core/retry/retry";
import * as Retry from "@supervisor/core/retry/retry";
import { constVoid, flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";
import type * as AdbStream from "./adb/adb-stream";
import * as AdbTracking from "./adb/adb-tracking";
import * as AndroidBridgeOrchestrator from "./android-bridge";
import * as Node from "./node";
import * as RecoveryEngine from "./recovery/engine";
import * as Registry from "./registry";
import * as SuitestTracking from "./suitest/tracking";

// Active Lifecycle: tutto ciò che esiste solo mentre il servizio è "active" secondo
// l'ActivationSchedule - tracker ADB/Suitest, orchestrator android-bridge, sync del registry.
// `deactivateActiveLifecycle` richiede in input esattamente il valore ritornato da
// `createActiveLifecycle`: non si possono fermare risorse che non si sono prima ottenute
// da una create riuscita.

export interface Policies {
  readonly adbTrackingPolicy: RetryPolicy.Policy;
  readonly suitestCameraTrackingPolicy: RetryPolicy.Policy;
  readonly suitestControlUnitTrackingPolicy: RetryPolicy.Policy;
  readonly suitestDeviceTrackingPolicy: RetryPolicy.Policy;
}

export interface Env {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly policies: Policies;
  readonly predicateStream: Predicates.PredicateStream;
  readonly adbDeviceStream: AdbStream.AdbDeviceStream;
  readonly recoveryStream: Recovery.RecoveryStream;
  readonly notifyStream: Notify.NotifyStream;
  readonly activityStream: Activity.ActivityStream;
}

export interface ActiveLifecycle {
  readonly adbTracking: IntervalLoop.Handle;
  readonly suitestTracking: IntervalLoop.Handle;
  readonly androidBridge: AndroidBridgeOrchestrator.Handle;
  readonly adbReconciler: IntervalLoop.Handle;
  readonly recovery: RecoveryEngine.Handle;
}

export type CreateError = Registry.SyncError | RecoveryEngine.StartError;

// Cadenza del tick di reconcile dell'AndroidBridge - non configurabile: un giro costa solo
// `Registry.read` (locale) più, per camera Disconnected, un tentativo già limitato/backoff-ato
// dalla propria policy di retry. Un tick più fitto non costa una richiesta esterna in più.
const ADB_RECONCILE_TICK_MS = 5000;

const readRegistry = (env: Env) =>
  Registry.read({
    logger: env.logger.child("Registry"),
    suitestConfig: env.config.suitest,
    dbPath: env.config.registry.dbPath,
    seedDevices: env.config.registry.devices,
    fsEnv: Node.fsEnv,
  });

const createAdbReconciler = (env: Env, androidBridge: AndroidBridgeOrchestrator.Handle): IntervalLoop.Handle => {
  const reconcileLog = env.logger.child("AndroidBridge");

  const tick = pipe(
    readRegistry(env),
    TE.orElseFirstIOK((error) => reconcileLog.error(`registry read failed - ${Errors.format(error)}`)),
    TE.flatMap((registry) =>
      pipe(
        androidBridge.reconcile(registry.lab),
        TE.orElseFirstIOK((error) => reconcileLog.error(`reconcile failed: ${Errors.format(error)}`)),
      ),
    ),
    TE.match(constVoid, constVoid),
  );

  return IntervalLoop.create(
    reconcileLog,
    Retry.constantDelay(ADB_RECONCILE_TICK_MS),
    tick,
    "(AndroidBridge) reconcile",
  );
};

const createRecovery = (
  env: Env,
  resources: Omit<ActiveLifecycle, "recovery">,
): TE.TaskEither<CreateError, ActiveLifecycle> =>
  pipe(
    RecoveryEngine.start({
      logger: env.logger.child("Recovery"),
      config: env.config,
      predicateStream: env.predicateStream,
      recoveryStream: env.recoveryStream,
      notifyStream: env.notifyStream,
      activityStream: env.activityStream,
      androidBridge: resources.androidBridge,
    }),
    TE.fromEither,
    TE.map((recovery): ActiveLifecycle => ({ ...resources, recovery })),
  );

const createResources =
  (env: Env): IO.IO<Omit<ActiveLifecycle, "recovery">> =>
  () => {
    const trackingLog = env.logger.child("Tracking");

    const androidBridge = AndroidBridgeOrchestrator.create(
      {
        logger: env.logger.child("AndroidBridge"),
        spawn: Node.spawn,
        adbPort: env.config.adb.port,
        activityStream: env.activityStream,
      },
      env.adbDeviceStream,
    );

    const adbReconciler = createAdbReconciler(env, androidBridge);

    const adbTracking = AdbTracking.create({
      logger: trackingLog,
      predicateStream: env.predicateStream,
      adbDeviceStream: env.adbDeviceStream,
      adbEnv: { logger: trackingLog.child("Tracker-ADB"), spawn: Node.spawn },
      policy: env.policies.adbTrackingPolicy,
    });

    const suitestTracking = SuitestTracking.create({
      logger: trackingLog,
      suitestConfig: env.config.suitest,
      stream: env.predicateStream,
      policies: {
        suitestCamera: env.policies.suitestCameraTrackingPolicy,
        suitestControlUnit: env.policies.suitestControlUnitTrackingPolicy,
        suitestDevice: env.policies.suitestDeviceTrackingPolicy,
      },
    });

    return { androidBridge, adbTracking, suitestTracking, adbReconciler };
  };

const startBackgroundLoops = ({ adbTracking, suitestTracking, adbReconciler }: ActiveLifecycle): IO.IO<void> =>
  IntervalLoop.detach(
    pipe(
      [suitestTracking.start, adbTracking.start, adbReconciler.start],
      TE.traverseArray(flow(IntervalLoop.detach, TE.fromIO)),
    ),
  );

const stopResources = ({
  adbTracking,
  suitestTracking,
  androidBridge,
  adbReconciler,
  recovery,
}: ActiveLifecycle): IO.IO<void> =>
  pipe(
    IO.Do,
    IO.flatMap(() => recovery.stop),
    IO.flatMap(() => adbTracking.stop),
    IO.flatMap(() => suitestTracking.stop),
    IO.flatMap(() => adbReconciler.stop),
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
    TE.tapIO(startBackgroundLoops),
  );

export const deactivateActiveLifecycle = (lifecycle: ActiveLifecycle): IO.IO<void> => stopResources(lifecycle);
