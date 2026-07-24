import * as ActivationRunner from "@supervisor/core/activation/runner";
import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as LogStream from "@supervisor/core/log-stream";
import * as Logger from "@supervisor/core/logger";
import type * as Network from "@supervisor/core/network";
import * as Predicates from "@supervisor/core/predicates/index";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule";
import type * as Db from "@supervisor/core/services/db";
import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import type * as P from "fp-ts/Predicate";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as Config from "./config";
import * as Connection from "./connection";
import * as ServiceLogger from "./logger";
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
    const discoveryLog = activationLog.child("Discovery");
    const workflowLog = discoveryLog.child("Workflow");

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

    // Snapshot risolto ad ogni tick di activation
    const cameraTargets: Readonly<Record<string, Network.Endpoint>> = {};

    const recoveryLog = logger.child("Recovery");
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

    const runWorkflow: (targets: readonly Network.Endpoint[]) => TE.TaskEither<Workflow.RunError, void> = flow(
      RA.traverse(TE.ApplicativeSeq)(
        Workflow.run({
          logger: workflowLog,
          spawn: Node.spawn,
          workflows: config.workflows,
        })("open-developer-settings"),
      ),
      TE.asUnit,
    );

    type ConnectPredicates = {
      // Determina se un determinato IP è noto al registry (controllato o meno)
      // un device completamente esterno al registry non va toccato, viene solo ignorato
      isControlled: P.Predicate<Network.Endpoint>;
      // Determina se un determinato IP è marcato come controllabile dal DB
      isKnown: P.Predicate<Network.Endpoint>;
    };

    const toConnectDevicePredicates = (db: Db.Db): TE.TaskEither<Errors.AppError, ConnectPredicates> => {
      // Aggiorna lo snapshot usato dalle capabilities del recovery per il dominio suitest-camera
      // cameraTargets = RecoveryService.cameraTargetsFromRegistry(db.lab);

      return pipe(
        TE.Do,
        TE.bind("knownHosts", () => TE.right(Connection.cameraHosts(db.lab))),
        TE.bind("controlledHosts", () => TE.right(Connection.controlledCameraHosts(db.lab))),
        TE.map(({ controlledHosts, knownHosts }) => ({
          isKnown: (target: Network.Endpoint) => knownHosts.includes(target.ip),
          isControlled: (target: Network.Endpoint) => controlledHosts.includes(target.ip),
        })),
      );
    };

    // Connection Manager Machine

    //Entità Suitest-Camera
    //Entità ADB Network-Target
    //
    //State machine che combine ADB e Suitest-Camera, se una camera ha il target attivo,
    //la machine della suitest-camera può elaborare comandi, eseguire workflows etc

    const activationFlow: TE.TaskEither<Errors.AppError, void> = pipe(
      Registry.sync({
        logger: activationLog.child("Registry"),
        suitestConfig: config.suitest,
        dbPath: config.registry.dbPath,
        seedDevices: config.registry.devices,
        fsEnv: Node.fsEnv,
      }),
      TE.flatMap(toConnectDevicePredicates),
      TE.flatMap(({ isControlled, isKnown }) =>
        pipe(
          // Questo Diventa qualcosa con LAN o simile
          Connection.discoverAndConnect({
            logger: discoveryLog,
            adbPort: config.adb.port,
            adbReconnectPolicy,
            spawn: Node.spawn,
            isControlled,
            isKnown,
          }),
          TE.flatMap(runWorkflow),
        ),
      ),
    );

    const decativationFlow: TE.TaskEither<Errors.AppError, void> = pipe(
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
        decativationFlow,
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
