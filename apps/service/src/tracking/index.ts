import type * as Config from "@supervisor/core/config";
import type * as Logger from "@supervisor/core/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import type * as AdbService from "@supervisor/core/services/adb";
import * as E from "fp-ts/Either";
import type * as IO from "fp-ts/IO";
import * as Adb from "./adb";
import type { AdbDeviceStream } from "./adb-stream";
import * as SuitestCamera from "./suitest-camera";
import * as SuitestControlUnit from "./suitest-control-unit";
import * as SuitestDevice from "./suitest-device";

export * as Adb from "./adb";
export * as AdbStream from "./adb-stream";

export interface TrackingPolicies {
  readonly adb: Retry.Policy;
  readonly suitestCamera: Retry.Policy;
  readonly suitestControlUnit: Retry.Policy;
  readonly suitestDevice: Retry.Policy;
}

export interface TrackingEnv {
  readonly logger: Logger.Tagged;
  readonly adbEnv: AdbService.AdbEnv;
  readonly adbDeviceStream: AdbDeviceStream;
  readonly suitestConfig: Config.Suitest;
  readonly policies: TrackingPolicies;
  readonly stream: Predicates.PredicateStream;
}

export const startAll = (env: TrackingEnv): IO.IO<void> => {
  const adb = Adb.run(env.logger.child("Tracker:adb"), env.stream, env.policies.adb, env.adbEnv, env.adbDeviceStream);

  const camera = Predicates.run(
    env.logger,
    env.stream,
    env.policies.suitestCamera,
    SuitestCamera.trackerConfig,
  )({ logger: env.logger.child("Tracker-Suitest:camera"), suitestConfig: env.suitestConfig });

  const controlUnit = Predicates.run(
    env.logger,
    env.stream,
    env.policies.suitestControlUnit,
    SuitestControlUnit.trackerConfig,
  )({ logger: env.logger.child("Tracker-Suitest:control-unit"), suitestConfig: env.suitestConfig });

  const device = Predicates.run(
    env.logger,
    env.stream,
    env.policies.suitestDevice,
    SuitestDevice.trackerConfig,
  )({ logger: env.logger.child("Tracker-Suitest:device"), suitestConfig: env.suitestConfig });

  const handles = [adb, camera, controlUnit, device];

  for (const handle of handles) {
    handle.start().then((result) => {
      if (E.isLeft(result)) {
        env.logger.error(`Tracking loop terminated unexpectedly: ${result.left.message}`)();
      }
    });
  }

  return () => {
    for (const handle of handles) handle.stop();
  };
};
