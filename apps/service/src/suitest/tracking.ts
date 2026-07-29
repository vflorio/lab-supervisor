import type * as Config from "@supervisor/core/config";
import * as IntervalLoop from "@supervisor/core/interval-loop";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";
import * as SuitestCamera from "./suitest-camera";
import * as SuitestControlUnit from "./suitest-control-unit";
import * as SuitestDevice from "./suitest-device";

export interface SuitestTrackingPolicies {
  readonly suitestCamera: Retry.Policy;
  readonly suitestControlUnit: Retry.Policy;
  readonly suitestDevice: Retry.Policy;
}

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly suitestConfig: Config.Suitest;
  readonly policies: SuitestTrackingPolicies;
  readonly stream: Predicates.PredicateStream;
}

export const create = ({ logger, stream, policies, suitestConfig }: Deps) => {
  const camera = Predicates.create(
    logger,
    stream,
    policies.suitestCamera,
    SuitestCamera.trackerConfig,
  )({ suitestConfig, logger: logger.child("Tracker-Suitest:camera") });

  const controlUnit = Predicates.create(
    logger,
    stream,
    policies.suitestControlUnit,
    SuitestControlUnit.trackerConfig,
  )({ suitestConfig, logger: logger.child("Tracker-Suitest:control-unit") });

  const device = Predicates.create(
    logger,
    stream,
    policies.suitestDevice,
    SuitestDevice.trackerConfig,
  )({ suitestConfig, logger: logger.child("Tracker-Suitest:device") });

  return {
    start: pipe(
      [camera.start, controlUnit.start, device.start],
      TE.traverseArray(flow(IntervalLoop.detach, TE.fromIO)),
      TE.asUnit,
    ),
    stop: pipe(
      IO.Do,
      IO.flatMap(() => camera.stop),
      IO.flatMap(() => controlUnit.stop),
      IO.flatMap(() => device.stop),
    ),
  } satisfies IntervalLoop.Handle;
};
