import type * as Config from "@supervisor/core/config";
import type * as Logger from "@supervisor/core/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import type * as AdbService from "@supervisor/core/services/adb";
import * as E from "fp-ts/Either";
import * as Adb from "./adb";
import * as SuitestCamera from "./suitest-camera";
import * as SuitestControlUnit from "./suitest-control-unit";
import * as SuitestDevice from "./suitest-device";

export * as Adb from "./adb";

// -------------------------------------------------------------------------------------
// Composizione dei 4 tracker di monitoring, ognuno sulla propria policy configurabile.
//
// Ogni tracker gira come loop indipendente, "fire and forget": non vanno mai concatenati
// nella catena RTE di service.ts che avvia l'ActivationRunner, perché quella catena non
// si risolve mai durante il normale funzionamento (il tick dell'activation runner ritorna
// solo dopo `stop()`) - un tracker incatenato dopo non partirebbe mai.
// -------------------------------------------------------------------------------------

export interface TrackingPolicies {
  readonly adb: Retry.Policy;
  readonly suitestCamera: Retry.Policy;
  readonly suitestControlUnit: Retry.Policy;
  readonly suitestDevice: Retry.Policy;
}

export interface TrackingEnv {
  readonly logger: Logger.Tagged;
  readonly adbEnv: AdbService.AdbEnv;
  readonly suitestConfig: Config.Suitest;
  readonly policies: TrackingPolicies;
  readonly stream: Predicates.PredicateStream;
}

export interface TrackingHandle {
  readonly adbDeviceFeed: Adb.DeviceFeed;
  readonly stop: () => void;
}

export const startAll = (env: TrackingEnv): TrackingHandle => {
  const adb = Adb.start(env.logger.child("adb"), env.stream, env.policies.adb, env.adbEnv);

  const camera = Predicates.run(
    env.logger,
    env.stream,
    env.policies.suitestCamera,
    SuitestCamera.trackerConfig,
  )({ logger: env.logger.child("camera"), suitestConfig: env.suitestConfig });

  const controlUnit = Predicates.run(
    env.logger,
    env.stream,
    env.policies.suitestControlUnit,
    SuitestControlUnit.trackerConfig,
  )({ logger: env.logger.child("control-unit"), suitestConfig: env.suitestConfig });

  const device = Predicates.run(
    env.logger,
    env.stream,
    env.policies.suitestDevice,
    SuitestDevice.trackerConfig,
  )({ logger: env.logger.child("device"), suitestConfig: env.suitestConfig });

  const handles = [adb.handle, camera, controlUnit, device];

  for (const handle of handles) {
    handle.start().then((result) => {
      if (E.isLeft(result)) env.logger.error(`Tracking loop terminated unexpectedly: ${result.left.message}`)();
    });
  }

  return {
    adbDeviceFeed: adb.deviceFeed,
    stop: () => {
      for (const handle of handles) handle.stop();
    },
  };
};
