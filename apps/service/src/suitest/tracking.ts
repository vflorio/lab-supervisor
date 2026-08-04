import type * as Config from "@supervisor/core/config";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as RetryCodec from "@supervisor/core/retry/codec";
import * as TaskRunner from "@supervisor/core/task-runner/index";
import { flow, pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";
import * as SuitestCamera from "./suitest-camera";
import * as SuitestControlUnit from "./suitest-control-unit";
import * as SuitestDevice from "./suitest-device";

export interface SuitestTrackingPolicies {
  readonly suitestCamera: RetryCodec.DescribedPolicy;
  readonly suitestControlUnit: RetryCodec.DescribedPolicy;
  readonly suitestDevice: RetryCodec.DescribedPolicy;
}

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly suitestConfig: Config.Suitest;
  readonly policies: SuitestTrackingPolicies;
  readonly stream: Predicates.PredicateStream;
  readonly loopStream?: TaskRunner.LoopStream;
}

export const create = ({ logger, stream, policies, suitestConfig, loopStream }: Deps) => {
  const camera = Predicates.create({
    logger,
    stream,
    policy: policies.suitestCamera.policy,
    config: SuitestCamera.trackerConfig,
    descriptor: { id: "tracker:suitest-camera", label: "Suitest - cameras", policyLabel: policies.suitestCamera.label },
    loopStream,
  })({ suitestConfig, logger: logger.child("Tracker-Suitest:camera") });

  const controlUnit = Predicates.create({
    logger,
    stream,
    policy: policies.suitestControlUnit.policy,
    config: SuitestControlUnit.trackerConfig,
    descriptor: {
      id: "tracker:suitest-control-unit",
      label: "Suitest - control units",
      policyLabel: policies.suitestControlUnit.label,
    },
    loopStream,
  })({ suitestConfig, logger: logger.child("Tracker-Suitest:control-unit") });

  const device = Predicates.create({
    logger,
    stream,
    policy: policies.suitestDevice.policy,
    config: SuitestDevice.trackerConfig,
    descriptor: { id: "tracker:suitest-device", label: "Suitest - devices", policyLabel: policies.suitestDevice.label },
    loopStream,
  })({ suitestConfig, logger: logger.child("Tracker-Suitest:device") });

  return {
    start: pipe(
      [camera.start, controlUnit.start, device.start],
      TE.traverseArray(flow(TaskRunner.detach, TE.fromIO)),
      TE.asUnit,
    ),
    stop: pipe(
      IO.Do,
      IO.flatMap(() => camera.stop),
      IO.flatMap(() => controlUnit.stop),
      IO.flatMap(() => device.stop),
    ),
  } satisfies TaskRunner.Handle;
};
