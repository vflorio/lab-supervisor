import * as Activation from "@supervisor/core/activation/runner";
import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import * as Activity from "@supervisor/core/activity/stream";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as Facts from "@supervisor/core/fact/index";
import * as LogStream from "@supervisor/core/logger/log-stream";
import * as Logger from "@supervisor/core/logger/logger";
import * as Notify from "@supervisor/core/notify/stream";
import * as Recovery from "@supervisor/core/recovery/index";
import * as RetryCodec from "@supervisor/core/retry/codec";
import type * as Schedule from "@supervisor/core/schedule/schedule";
import * as TaskRunner from "@supervisor/core/task-runner/index";
import type * as Validation from "@supervisor/core/validation";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import * as E from "fp-ts/Either";
import { constVoid, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as IORef from "fp-ts/IORef";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as AndroidBridge from "./android-bridge/runner";
import * as Provisioning from "./android-provisioning/runner";
import * as Config from "./config";
import * as ServiceLogger from "./logger";
import * as Node from "./node";
import * as ServiceLifecycle from "./service-lifecycle";
import * as Trpc from "./trpc/server";
import * as TrpcServices from "./trpc/services";

export interface Env {
  readonly logger: Logger.Tagged;
  readonly process: Node.Process;
  readonly configFetcher: Config.ConfigFetcher;
  readonly configPath: O.Option<string>;
}

type Effect<A> = RTE.ReaderTaskEither<
  Env,
  Validation.ValidationError | Config.FetchError | RetryCodec.PolicyDecodeError | Activation.StartError,
  A
>;

const loadConfig: Effect<ConfigModel.Service> = (env) => Config.load(env.configFetcher);

const parseConfigPolicies = (config: ConfigModel.Service): Effect<ServiceLifecycle.TrackingPolicies> =>
  pipe(
    E.Do,
    E.bind("androidBridge", () => RetryCodec.described(config.tracking.adb.policy)),
    E.bind("androidAgent", () => RetryCodec.described(config.tracking.agent.policy)),
    E.bind("suitestCamera", () => RetryCodec.described(config.tracking.suitestCamera.policy)),
    E.bind("suitestControlUnit", () => RetryCodec.described(config.tracking.suitestControlUnit.policy)),
    E.bind("suitestDevice", () => RetryCodec.described(config.tracking.suitestDevice.policy)),
    RTE.fromEither,
  );

// Attivo dopo 5s dall'inizio dello script, termina dopo 2m
const devActivationSchedule = (): Schedule.Schedule => {
  const debugActiveFrom = Date.now() + 5000;
  const debugActiveTo = debugActiveFrom + 2 * 60000;

  return () => {
    const now = Date.now();
    return now >= debugActiveFrom && now < debugActiveTo;
  };
};

export interface ServiceHandle {
  readonly stop: () => void;
}

export const create: Effect<ServiceHandle> = pipe(
  RTE.Do,
  RTE.bind("config", () => loadConfig),
  RTE.bind("policies", ({ config }) => parseConfigPolicies(config)),
  RTE.bind("configPath", () => RTE.asks((env: Env) => env.configPath)),

  RTE.map(({ config, policies, configPath }) => {
    const logStream = LogStream.createLogStream();
    const logger = pipe(ServiceLogger.create(config.log, [logStream.transport]), Logger.tagged("Service"));

    const activationSchedule = import.meta.env.DEV_ACTIVATION_SCHEDULE
      ? devActivationSchedule()
      : ActivationSchedule.toSchedule(config.activationSchedule);

    logger.info(`Activation schedule: ${ActivationSchedule.format(config.activationSchedule)}`)();

    const activationLog = logger.child("Activation");

    const factStream = Facts.createFactStream();
    const adbDeviceStream = AndroidBridge.createAdbDeviceStream();
    const recoveryStream = Recovery.createRecoveryStream();
    const notifyStream = Notify.createNotifyStream();
    const activityStream = Activity.createActivityStream();
    const loopStream = TaskRunner.createLoopStream();

    const isActive = IORef.newIORef<O.Option<ServiceLifecycle.ActiveLifecycle>>(O.none)();

    // tRPC
    const resetRecovery = (policyLabel: string, entityId: string, tripwireIndex: number): boolean =>
      pipe(
        isActive.read(),
        O.map((lifecycle) => lifecycle.recovery.rearmTripwire(policyLabel, entityId, tripwireIndex)),
        O.getOrElse(() => false),
      );

    // Il runner manuale esiste solo mentre il servizio è "active" (stessa ragione di resetRecovery).
    const runManualWorkflow = (
      cameraId: string,
      workflowName: string,
    ): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> =>
      pipe(
        isActive.read(),
        O.map((lifecycle) => lifecycle.runWorkflow(cameraId, workflowName)),
        O.getOrElse(() => TE.left(WorkflowInterpreter.workflowError("Service not active"))),
      );

    // Fuori dall'ActiveLifecycle di proposito: il provisioning e' un'azione manuale di un
    // operatore davanti al device, e un device factory-resettato non aspetta l'orario di
    // lavoro per tornare in servizio.
    const provisioning = Provisioning.create({
      logger: logger.child("Provisioning"),
      spawn: Node.spawn,
      config: O.fromNullable(config.provisioning),
      factStream,
      activityStream,
    });

    const trpcLog = logger.child("tRPC");
    const trpcServer = Trpc.startServer({
      port: config.trpc.port,
      hostname: config.trpc.hostname,
      logger: trpcLog,
      services: TrpcServices.create({
        config,
        configPath,
        trpcLog,
        logStream,
        adbDeviceStream,
        factStream,
        recoveryStream,
        notifyStream,
        activityStream,
        loopStream,
        provisioning,
        resetRecovery,
        runManualWorkflow,
      }),
    });

    const clearActive: IO.IO<void> = isActive.write(O.none);

    const deactivateIfActive: IO.IO<void> = () =>
      pipe(
        isActive.read(),
        O.match(() => constVoid, ServiceLifecycle.deactivateActiveLifecycle),
      )();

    const activationRunner = Activation.create(activationLog, activationSchedule, {
      onActive: pipe(
        ServiceLifecycle.createActiveLifecycle({
          logger: activationLog,
          config,
          policies,
          factStream,
          adbDeviceStream,
          recoveryStream,
          notifyStream,
          activityStream,
          loopStream,
          provisioning,
        }),
        TE.tapIO((lifecycle) => isActive.write(O.some(lifecycle))),
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
