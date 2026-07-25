import type * as ConfigModel from "@supervisor/core/config";
import type * as IntervalLoop from "@supervisor/core/interval-loop";
import type * as Logger from "@supervisor/core/logger";
import type * as Predicates from "@supervisor/core/predicates/index";
import type * as RetryPolicy from "@supervisor/core/retry/retry";
import type * as Db from "@supervisor/core/services/db";
import { pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";
import type * as AdbStream from "./adb/adb-stream";
import * as AdbTracking from "./adb/adb-tracking";
import * as AndroidBridgeOrchestrator from "./machines/android-bridge/orchestrator";
import * as Node from "./node";
import * as Registry from "./registry";
import * as SuitestTracking from "./suitest/tracking";

// -------------------------------------------------------------------------------------
// Active Lifecycle
//
// Tutto ciò che esiste solo mentre il servizio è "active" secondo l'ActivationSchedule:
// i tracker ADB/Suitest, l'orchestrator android-bridge (sottoscrive adbDeviceStream)
// e il sync del registry.
//
// `deactivateActiveLifecycle` richiede in input esattamente il valore ritornato da
// `createActiveLifecycle`: non esiste un modo di fermare risorse che non si è prima
// ottenute da una create riuscita (il chiamante non può costruirsi un ActiveLifecycle
// a mano, i suoi campi sono derivati dalle singole create dei tracker).
// -------------------------------------------------------------------------------------

export interface Policies {
  readonly adbReconnectPolicy: RetryPolicy.Policy;
  readonly adbTrackingPolicy: RetryPolicy.Policy;
  readonly suitestCameraTrackingPolicy: RetryPolicy.Policy;
  readonly suitestControlUnitTrackingPolicy: RetryPolicy.Policy;
  readonly suitestDeviceTrackingPolicy: RetryPolicy.Policy;
}

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly policies: Policies;
  readonly predicateStream: Predicates.PredicateStream;
  readonly adbDeviceStream: AdbStream.AdbDeviceStream;
}

export interface ActiveLifecycle {
  readonly adbTracking: IntervalLoop.Handle;
  readonly suitestTracking: IntervalLoop.Handle;
  readonly androidBridge: AndroidBridgeOrchestrator.Handle;
}

export type CreateError = IntervalLoop.StartError | Registry.SyncError;

// -------------------------------------------------------------------------------------
// Internal
// -------------------------------------------------------------------------------------

const createResources =
  (deps: Deps): IO.IO<ActiveLifecycle> =>
  () => {
    const trackingLog = deps.logger.child("Tracking");

    const adbTracking = AdbTracking.create({
      logger: trackingLog,
      predicateStream: deps.predicateStream,
      adbDeviceStream: deps.adbDeviceStream,
      adbEnv: { logger: trackingLog.child("Tracker-ADB"), spawn: Node.spawn },
      policy: deps.policies.adbTrackingPolicy,
    });

    const suitestTracking = SuitestTracking.create({
      logger: trackingLog,
      suitestConfig: deps.config.suitest,
      stream: deps.predicateStream,
      policies: {
        suitestCamera: deps.policies.suitestCameraTrackingPolicy,
        suitestControlUnit: deps.policies.suitestControlUnitTrackingPolicy,
        suitestDevice: deps.policies.suitestDeviceTrackingPolicy,
      },
    });

    // Sottoscrive adbDeviceStream nel momento stesso in cui viene costruito: se un passo
    // successivo di createActiveLifecycle fallisce, questa subscription va disfatta esplicitamente
    // (stopResources), altrimenti resta appesa oltre la finestra active che l'ha creata.
    const androidBridge = AndroidBridgeOrchestrator.create(
      {
        logger: deps.logger.child("AndroidBridge"),
        spawn: Node.spawn,
        adbPort: deps.config.adb.port,
        adbReconnectPolicy: deps.policies.adbReconnectPolicy,
      },
      deps.adbDeviceStream,
    );

    return { adbTracking, suitestTracking, androidBridge };
  };

const startTrackers = ({
  adbTracking,
  suitestTracking,
}: ActiveLifecycle): TE.TaskEither<IntervalLoop.StartError | Db.DbError, void> =>
  pipe(
    TE.Do,
    TE.flatMap(() => adbTracking.start),
    TE.flatMap(() => suitestTracking.start),
  );

const stopResources = ({ adbTracking, suitestTracking, androidBridge }: ActiveLifecycle): IO.IO<void> =>
  pipe(
    IO.Do,
    IO.flatMap(() => adbTracking.stop),
    IO.flatMap(() => suitestTracking.stop),
    IO.flatMap(() => androidBridge.stop),
  );

// -------------------------------------------------------------------------------------
// Public
// -------------------------------------------------------------------------------------

export const createActiveLifecycle = (deps: Deps): TE.TaskEither<CreateError, ActiveLifecycle> =>
  pipe(
    TE.fromIO(createResources(deps)),
    TE.tap(startTrackers),
    TE.tap((lifecycle) =>
      pipe(
        Registry.sync({
          logger: deps.logger.child("Registry"),
          suitestConfig: deps.config.suitest,
          dbPath: deps.config.registry.dbPath,
          seedDevices: deps.config.registry.devices,
          fsEnv: Node.fsEnv,
        }),
        TE.tapIO(() => deps.logger.info("Activation flow completed")),
        TE.orElseFirstIOK(() => stopResources(lifecycle)),
      ),
    ),
  );

export const deactivateActiveLifecycle = (lifecycle: ActiveLifecycle): IO.IO<void> => stopResources(lifecycle);
