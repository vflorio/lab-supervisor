import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import * as Activity from "@supervisor/core/activity/stream";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as LogStream from "@supervisor/core/log-stream";
import * as Logger from "@supervisor/core/logger";
import * as Notify from "@supervisor/core/notify/stream";
import * as Predicates from "@supervisor/core/predicates/index";
import * as Recovery from "@supervisor/core/recovery/index";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import type * as Schedule from "@supervisor/core/schedule";
import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as AdbStream from "./adb/adb-stream";
import * as Config from "./config";
import * as ServiceLogger from "./logger";
import * as Activation from "./machines/activation";
import type * as Node from "./node";
import * as ServiceLifecycle from "./service-lifecycle";
import { createServices } from "./services";
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

  RTE.map(({ config, policies }) => {
    const logStream = LogStream.createLogStream();
    const logger = pipe(ServiceLogger.create(config.log, [logStream.transport]), Logger.tagged("Service"));

    // Schedule di attivazione: Inizia dopo 5s, dura 2m
    const debugSchedule = (): Schedule.Schedule => {
      const debugActiveFrom = Date.now() + 5000;
      const debugActiveTo = debugActiveFrom + 2 * 60000;

      return () => {
        const now = Date.now();
        return now >= debugActiveFrom && now < debugActiveTo;
      };
    };

    const activationSchedule = import.meta.env.DEV
      ? debugSchedule()
      : ActivationSchedule.toSchedule(config.activationSchedule);

    logger.info(`Activation schedule: ${ActivationSchedule.format(config.activationSchedule)}`)();

    const activationLog = logger.child("Activation");

    const predicateStream = Predicates.createPredicateStream();
    const adbDeviceStream = AdbStream.createAdbDeviceStream();
    const recoveryStream = Recovery.createRecoveryStream();
    const notifyStream = Notify.createNotifyStream();
    const activityStream = Activity.createActivityStream();

    const trpcLog = logger.child("tRPC");
    const trpcServer = Trpc.startServer({
      port: config.trpc.port,
      hostname: config.trpc.hostname,
      logger: trpcLog,
      services: createServices({
        config,
        trpcLog,
        logStream,
        adbDeviceStream,
        predicateStream,
        recoveryStream,
        notifyStream,
        activityStream,
      }),
    });

    let active: O.Option<ServiceLifecycle.ActiveLifecycle> = O.none;

    const clearActive: IO.IO<void> = () => {
      active = O.none;
    };

    const deactivateIfActive: IO.IO<void> = () =>
      pipe(
        active,
        O.match(() => IO.of(undefined), ServiceLifecycle.deactivateActiveLifecycle),
      )();

    const activationRunner = Activation.create(activationLog, activationSchedule, {
      onActive: pipe(
        ServiceLifecycle.createActiveLifecycle({
          logger: activationLog,
          config,
          policies,
          predicateStream,
          adbDeviceStream,
          recoveryStream,
          notifyStream,
          activityStream,
        }),
        TE.tapIO((lifecycle) => () => {
          active = O.some(lifecycle);
        }),
        TE.asUnit,
        TE.getOrElse((error) => T.fromIO(activationLog.error(`Activation flow failed: ${Errors.format(error)}`))),
      ),

      onInactive: T.fromIO(
        pipe(
          deactivateIfActive,
          IO.flatMap(() => clearActive),
        ),
      ),
    });

    activationRunner.start();

    return {
      stop: () =>
        pipe(
          TE.fromIO(activationRunner.stop),
          TE.flatMapIO(() => deactivateIfActive),
          TE.flatMap(() => trpcServer.stop),
          TE.flatMapIO(() => logger.info("stop completed")),
        ),
    };
  }),
);
