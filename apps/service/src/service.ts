import * as ActivationRunner from "@supervisor/core/activation/runner";
import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as LogStream from "@supervisor/core/log-stream";
import * as Logger from "@supervisor/core/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule";
import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as Config from "./config";
import * as ServiceLogger from "./logger";
import * as AndroidBridgeOrchestrator from "./machines/android-bridge/orchestrator";
import * as Node from "./node";
import * as RecoveryService from "./recovery";
import * as Registry from "./registry";
import { createServices } from "./services";
import * as TrackingService from "./tracking";
import * as Trpc from "./trpc";
import * as Workflow from "./workflow";

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
  Validation.ValidationError | Config.FetchError | RetryPolicy.PolicyDecodeError | ActivationRunner.StartError,
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
  activationPolicy: RetryPolicy.Policy;
  adbReconnectPolicy: RetryPolicy.Policy;
  adbTrackingPolicy: RetryPolicy.Policy;
  suitestCameraTrackingPolicy: RetryPolicy.Policy;
  suitestControlUnitTrackingPolicy: RetryPolicy.Policy;
  suitestDeviceTrackingPolicy: RetryPolicy.Policy;
}> =>
  pipe(
    E.Do,
    E.bind("activationPolicy", () => RetryPolicy.decode(config.activation.polling)),
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
      activationPolicy,
      adbReconnectPolicy,
      adbTrackingPolicy,
      suitestCameraTrackingPolicy,
      suitestControlUnitTrackingPolicy,
      suitestDeviceTrackingPolicy,
    } = policies;

    const logStream = LogStream.createLogStream();
    const logger = pipe(ServiceLogger.create(config.log, [logStream.transport]), Logger.tagged("Service"));

    const activationSchedule = ActivationSchedule.toSchedule(config.activationSchedule);

    logger.info(`Activation schedule: ${ActivationSchedule.format(config.activationSchedule)}`)();
    logger.info(`Activation policy: ${RetryPolicy.formatPolicyJson(config.activation.polling)}`)();

    const now = Schedule.toTimeSlot(new Date());

    pipe(
      IO.of(activationSchedule(now)),
      IO.tap((isActive) =>
        isActive
          ? logger.info("ACTIVE - currently inside work schedule")
          : logger.info("IDLE - currently outside work schedule"),
      ),
    )();

    const activationLog = logger.child("ActivationRunner");
    // const workflowLog = activationLog.child("Discovery").child("Workflow");

    const predicateStream = Predicates.createPredicateStream();
    const adbDeviceStream = TrackingService.AdbStream.createAdbDeviceStream();

    const trackingLog = logger.child("Tracking");
    const stopTracking = TrackingService.startAll({
      logger: trackingLog,
      suitestConfig: config.suitest,
      stream: predicateStream,
      adbDeviceStream,
      adbEnv: { logger: trackingLog.child("Tracker-ADB"), spawn: Node.spawn },
      policies: {
        adb: adbTrackingPolicy,
        suitestCamera: suitestCameraTrackingPolicy,
        suitestControlUnit: suitestControlUnitTrackingPolicy,
        suitestDevice: suitestDeviceTrackingPolicy,
      },
    });
    stopTracking();
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
      services: createServices(config, trpcLog, stopTracking, logStream, predicateStream),
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
    // Entità Suitest-Camera / Entità ADB Network-Target: per ogni camera controlled del
    // lab-registry, l'orchestrator android-bridge (machines/android-bridge) mantiene una FSM
    // che si connette e resta Idle finché la connessione ADB è viva. Una camera nota al
    // registry ma non (più) controllata viene disconnessa
    // attivamente (concetto "known" recuperato da connection/gating.ts); un device del tutto
    // esterno al registry viene ignorato. Se la connessione cade, l'orchestrator lo rileva via
    // adbDeviceStream (già polled da tracking/adb.ts) e riflette lo stato: acceptsCommands
    // torna false finché il prossimo tick di activation non la riconnette.
    const androidBridge = AndroidBridgeOrchestrator.create(
      { logger: activationLog.child("AndroidBridge"), spawn: Node.spawn, adbPort: config.adb.port, adbReconnectPolicy },
      adbDeviceStream,
    );

    // activationFlow gira ad ogni tick di ActivationRunner (cadenza activationPolicy =
    // config.activation.polling, gated da activationSchedule): risincronizza il registry
    // (init db se non esiste + refresh Suitest) e riconcilia le connessioni android-bridge.
    const activationFlow: TE.TaskEither<Errors.AppError, void> = pipe(
      Registry.sync({
        logger: activationLog.child("Registry"),
        suitestConfig: config.suitest,
        dbPath: config.registry.dbPath,
        seedDevices: config.registry.devices,
        fsEnv: Node.fsEnv,
      }),
      TE.flatMap((db) => androidBridge.reconcile(db.lab)),
      TE.flatMapIO(() => logger.info("Activation flow completed")),
    );

    const deactivationFlow: TE.TaskEither<Errors.AppError, void> = pipe(
      trpcServer.stop,
      TE.flatMapIO(() => stopTracking),
      //TE.flatMapIO(() => () => recoveryHandles.forEach((h) => h.stop())),
    );

    const activationRunner = ActivationRunner.create(activationLog, activationSchedule, activationPolicy, {
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
