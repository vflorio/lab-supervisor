import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as LogStream from "@supervisor/core/log-stream";
import * as Logger from "@supervisor/core/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import type * as Schedule from "@supervisor/core/schedule";
import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as AdbStream from "./adb/adb-stream";
import * as AdbTracking from "./adb/adb-tracking";
import * as Config from "./config";
import * as ServiceLogger from "./logger";
import * as Activation from "./machines/activation";
import * as AndroidBridgeOrchestrator from "./machines/android-bridge/orchestrator";
import * as Node from "./node";
import * as Registry from "./registry";
import { createServices } from "./services";
import * as SuitestTracking from "./suitest/tracking";
import * as Trpc from "./trpc";

// -------------------------------------------------------------------------------------
// Env
// -------------------------------------------------------------------------------------

export interface Env {
  readonly logger: Logger.Tagged;
  readonly configFetcher: Config.ConfigFetcher;
  readonly process: Node.Process;
}

// -------------------------------------------------------------------------------------
// Internal
// -------------------------------------------------------------------------------------

type Effect<A> = RTE.ReaderTaskEither<
  Env,
  Validation.ValidationError | Config.FetchError | RetryPolicy.PolicyDecodeError | Activation.StartError,
  A
>;

const logInfo = (message: string): Effect<void> =>
  pipe(
    RTE.ask<Env>(),
    RTE.tapIO((env) => env.logger.info(message)),
    RTE.asUnit,
  );

const loadConfig: Effect<ConfigModel.Service> = (env) => Config.load(env.configFetcher);

const parseConfigPolicies = (
  config: ConfigModel.Service,
): Effect<{
  adbReconnectPolicy: RetryPolicy.Policy;
  adbTrackingPolicy: RetryPolicy.Policy;
  suitestCameraTrackingPolicy: RetryPolicy.Policy;
  suitestControlUnitTrackingPolicy: RetryPolicy.Policy;
  suitestDeviceTrackingPolicy: RetryPolicy.Policy;
}> =>
  pipe(
    E.Do,
    E.bind("adbReconnectPolicy", () => RetryPolicy.decode(config.adb.reconnect)),
    E.bind("adbTrackingPolicy", () => RetryPolicy.decode(config.tracking.adb.polling)),
    E.bind("suitestCameraTrackingPolicy", () => RetryPolicy.decode(config.tracking.suitestCamera.polling)),
    E.bind("suitestControlUnitTrackingPolicy", () => RetryPolicy.decode(config.tracking.suitestControlUnit.polling)),
    E.bind("suitestDeviceTrackingPolicy", () => RetryPolicy.decode(config.tracking.suitestDevice.polling)),
    RTE.fromEither,
  );

// -------------------------------------------------------------------------------------
// Public
// -------------------------------------------------------------------------------------

export interface ServiceHandle {
  readonly stop: () => void;
}

export const create: Effect<ServiceHandle> = pipe(
  logInfo("Loading config..."),
  RTE.bind("config", () => loadConfig),
  RTE.bind("policies", ({ config }) => parseConfigPolicies(config)),

  RTE.flatMap(({ config, policies }) => {
    const {
      adbReconnectPolicy,
      adbTrackingPolicy,
      suitestCameraTrackingPolicy,
      suitestControlUnitTrackingPolicy,
      suitestDeviceTrackingPolicy,
    } = policies;

    const logStream = LogStream.createLogStream();
    const logger = pipe(ServiceLogger.create(config.log, [logStream.transport]), Logger.tagged("Service"));

    // const activationSchedule = ActivationSchedule.toSchedule(config.activationSchedule);
    const debugActiveFrom = Date.now() + 5000;
    const debugActiveTo = debugActiveFrom + 2 * 60000;
    const activationSchedule: Schedule.Schedule = () => {
      const now = Date.now();
      return now >= debugActiveFrom && now < debugActiveTo;
    };

    logger.info(`Activation schedule: ${ActivationSchedule.format(config.activationSchedule)}`)();

    const activationLog = logger.child("Activation");
    // const workflowLog = activationLog.child("Discovery").child("Workflow");

    const predicateStream = Predicates.createPredicateStream();

    const trackingLog = logger.child("Tracking");

    const adbDeviceStream = AdbStream.createAdbDeviceStream();

    const adbTracking = AdbTracking.create({
      logger: trackingLog,
      predicateStream,
      adbDeviceStream,
      adbEnv: { logger: trackingLog.child("Tracker-ADB"), spawn: Node.spawn },
      policy: adbTrackingPolicy,
    });

    const suitestTracking = SuitestTracking.create({
      logger: trackingLog,
      suitestConfig: config.suitest,
      stream: predicateStream,
      policies: {
        suitestCamera: suitestCameraTrackingPolicy,
        suitestControlUnit: suitestControlUnitTrackingPolicy,
        suitestDevice: suitestDeviceTrackingPolicy,
      },
    });

    // Snapshot risolto ad ogni tick di activation
    //   const cameraTargets: Readonly<Record<string, Network.Endpoint>> = {};

    // const recoveryLog = logger.child("Recovery");
    //const recoveryHandles = RecoveryService.startAll(config.recovery ?? [], {
    //  logger: recoveryLog,
    //  stream: predicateStream,
    //  workflows: config.workflows,
    //  spawn: Node.spawn,
    //  tickPolicy: RetryPolicy.constantDelay(5000),
    //  cameraTargets: () => cameraTargets,
    //});

    const trpcLog = logger.child("tRPC");
    const trpcServer = Trpc.startServer({
      port: config.trpc.port,
      hostname: config.trpc.hostname,
      logger: trpcLog,
      services: createServices({ config, trpcLog, adbDeviceStream, logStream, predicateStream }),
    });

    //  const runWorkflow: (targets: readonly Network.Endpoint[]) => TE.TaskEither<Workflow.RunError, void> = flow(
    //    RA.traverse(TE.ApplicativeSeq)(
    //      Workflow.run({
    //        logger: workflowLog,
    //        spawn: Node.spawn,
    //        workflows: config.workflows,
    //      })("open-developer-settings"),
    //    ),
    //    TE.asUnit,
    //  );

    // Connection Manager Machine
    //
    const androidBridge = AndroidBridgeOrchestrator.create(
      { logger: activationLog.child("AndroidBridge"), spawn: Node.spawn, adbPort: config.adb.port, adbReconnectPolicy },
      adbDeviceStream,
    );

    // SOLO DEBUG: decoupling android
    const loop = () =>
      pipe(
        Registry.read({
          logger: activationLog.child("Registry"),
          suitestConfig: config.suitest,
          dbPath: config.registry.dbPath,
          seedDevices: config.registry.devices,
          fsEnv: Node.fsEnv,
        }),
        // La riconciliazione è decoupled perché dipende dallo stato di .controlled nel registry
        TE.flatMap((db) => androidBridge.reconcile(db.lab)),
      )().then(() => setTimeout(loop, 1000));

    //loop();

    // activationFlow gira una volta sola all'ingresso in fase Active (Activation è edge-triggered,
    // non richiama più onActive ad ogni tick): risincronizza il registry (init db se non esiste
    // + refresh Suitest). La riconciliazione continua delle connessioni android-bridge è
    // decoupled dalla fase di activation (vedi `loop` sopra).
    const activationFlow: TE.TaskEither<Errors.AppError, void> = pipe(
      Registry.sync({
        logger: activationLog.child("Registry"),
        suitestConfig: config.suitest,
        dbPath: config.registry.dbPath,
        seedDevices: config.registry.devices,
        fsEnv: Node.fsEnv,
      }),
      TE.flatMapIO(() => logger.info("Activation flow completed")),
    );

    const deactivationFlow: TE.TaskEither<Errors.AppError, void> = pipe(
      trpcServer.stop,
      TE.flatMapIO(() => adbTracking.stop),
      TE.flatMapIO(() => suitestTracking.stop),
      //TE.flatMapIO(() => () => recoveryHandles.forEach((h) => h.stop())),
    );

    const activationRunner = Activation.create(activationLog, activationSchedule, {
      onActive: pipe(
        activationFlow,
        TE.getOrElse((error) => T.fromIO(logger.error(`Activation flow failed: ${Errors.format(error)}`))),
      ),

      onInactive: pipe(
        deactivationFlow,
        TE.getOrElse((error) => T.fromIO(logger.error(`Deactivation flow failed: ${Errors.format(error)}`))),
      ),
    });

    return RTE.fromTaskEither(
      pipe(
        activationRunner.start,
        TE.map(() => ({
          stop: () =>
            pipe(
              TE.fromIO(activationRunner.stop),
              TE.flatMapIO(() => logger.info("stop completed")),
            ),
        })),
      ),
    );
  }),
);
