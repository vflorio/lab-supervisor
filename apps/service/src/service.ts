import * as ActivationRunner from "@supervisor/core/activation/runner";
import * as ActivationSchedule from "@supervisor/core/activation/schedule";
import * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as LogStream from "@supervisor/core/log-stream";
import * as Logger from "@supervisor/core/logger";
import * as NetworkTarget from "@supervisor/core/network-target";
import * as Predicates from "@supervisor/core/predicates/index";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule";
import * as Adb from "@supervisor/core/services/adb";
import * as Db from "@supervisor/core/services/db";
import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import * as Config from "./config";
import * as Connection from "./connection";
import * as ServiceLogger from "./logger";
import * as Node from "./node";
import * as Registry from "./registry";
import * as Tracking from "./tracking";
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
    E.bind("activationPolicy", () => RetryPolicy.decode(config.monitoring.polling)),
    E.bind("adbReconnectPolicy", () => RetryPolicy.decode(config.adb.reconnect)),
    E.bind("adbTrackingPolicy", () => RetryPolicy.decode(config.tracking.adb.polling)),
    E.bind("suitestCameraTrackingPolicy", () => RetryPolicy.decode(config.tracking.suitestCamera.polling)),
    E.bind("suitestControlUnitTrackingPolicy", () => RetryPolicy.decode(config.tracking.suitestControlUnit.polling)),
    E.bind("suitestDeviceTrackingPolicy", () => RetryPolicy.decode(config.tracking.suitestDevice.polling)),
    RTE.fromEither,
  );

// -------------------------------------------------------------------------------------
// Service
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

    logger.info(`Config loaded - schedule: ${ActivationSchedule.toString(config.activationSchedule)}`)();
    logger.info(`Polling policy: ${RetryPolicy.policyJsonToString(config.monitoring.polling)}`)();

    const slot = Schedule.toTimeSlot(new Date());

    pipe(
      IO.of(activationSchedule(slot)),
      IO.flatMap((isActive) =>
        isActive
          ? logger.info("ACTIVE - currently inside work schedule")
          : logger.info(`IDLE - waiting for (${ActivationSchedule.toString(config.activationSchedule)})`),
      ),
    )();

    const activationLog = logger.child("ActivationRunner");
    const discoveryLog = activationLog.child("Discovery");
    const workflowLog = discoveryLog.child("Workflow");
    const registryLog = activationLog.child("Registry");
    const trackingLog = logger.child("Tracking");

    const predicateStream = Predicates.createPredicateStream();

    const trackingHandle = Tracking.startAll({
      logger: trackingLog,
      adbEnv: { logger: trackingLog.child("adb"), spawn: Node.spawn },
      suitestConfig: config.suitest,
      stream: predicateStream,
      policies: {
        adb: adbTrackingPolicy,
        suitestCamera: suitestCameraTrackingPolicy,
        suitestControlUnit: suitestControlUnitTrackingPolicy,
        suitestDevice: suitestDeviceTrackingPolicy,
      },
    });

    const runWorkflow: (targets: readonly NetworkTarget.Target[]) => TE.TaskEither<Workflow.RunError, void> = flow(
      RA.traverse(TE.ApplicativeSeq)(
        Workflow.run({ logger: workflowLog, spawn: Node.spawn, workflows: config.workflows })(
          "open-developer-settings",
        ),
      ),
      TE.asUnit,
    );

    const activationRunner = ActivationRunner.create(activationLog, activationSchedule, activationPolicy, {
      onActive: pipe(
        // Sync registry prima di discover
        Registry.sync({
          logger: registryLog,
          suitestConfig: config.suitest,
          dbPath: config.registry.dbPath,
          seedDevices: config.registry.devices,
          fsEnv: Node.fsEnv,
        }),

        // Costruisci i predicati per determinare se ci connettiamo al device
        TE.flatMap((db) =>
          pipe(
            TE.Do,
            TE.bind("knownHosts", () => TE.right(Connection.cameraHosts(db.lab))),
            TE.bind("controlledHosts", () => TE.right(Connection.controlledCameraHosts(db.lab))),
            TE.map(({ controlledHosts, knownHosts }) => ({
              // Determina se un determinato IP è noto al registry (controllato o meno)
              // un device completamente esterno al registry non va toccato, viene solo ignorato
              isKnown: (target: NetworkTarget.Target): boolean => knownHosts.includes(target.ip),
              // Determina se un determinato IP è marcato come controllabile dal DB
              isControlled: (target: NetworkTarget.Target): boolean => controlledHosts.includes(target.ip),
            })),
          ),
        ),

        // Cerca e connette i device che rispettano i predicati
        TE.flatMap(({ isControlled, isKnown }) =>
          pipe(
            // Cerca e connette i device tramite mDNS e ADB (Target Machine, 1 device alla volta)
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
        TE.tapError((error) => TE.fromIO(logger.error(`Activation tick failed: ${Errors.format(error)}`))),
        T.asUnit,
      ),
    });

    const trpcLog = logger.child("tRPC");

    const trpcServer = Trpc.startServer({
      port: config.trpc.port,
      hostname: config.trpc.hostname,
      logger: trpcLog,
      services: {
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
              TE.map(RA.map((device) => ({ ...device, target: NetworkTarget.format(device.target) }))),
            ),

          // Riavvia un device tramite ADB
          reboot: (target) => Adb.reboot(target)({ logger: trpcLog, spawn: Node.spawn }),

          // Live feed dei device ADB alimentato dal tracker centralizzato (apps/service/src/tracking/adb):
          // consolidato qui per evitare che `android.devicesTail` ripolli `adb devices` per conto proprio
          devicesFeed: {
            subscribe: (listener) =>
              trackingHandle.adbDeviceFeed.subscribe((devices) =>
                listener(devices.map((device) => ({ ...device, target: NetworkTarget.format(device.target) }))),
              ),

            snapshot: () =>
              trackingHandle.adbDeviceFeed
                .snapshot()
                .map((device) => ({ ...device, target: NetworkTarget.format(device.target) })),
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

            remove: (deviceId: string) =>
              Db.modifyLab(config.registry.dbPath)(Db.removeTvByDeviceId(deviceId))(Node.fsEnv),
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
      },
    });

    return RTE.fromTaskEither(
      pipe(
        activationRunner.start,
        TE.map(() => ({
          stop: () =>
            pipe(
              TE.fromIO(activationRunner.stop),
              TE.flatMapIO(() => trackingHandle.stop),
              TE.flatMap(() => trpcServer.stop),
              TE.flatMapIO(() => logger.info("stop completed")),
            ),
        })),
      ),
    );
  }),
);
