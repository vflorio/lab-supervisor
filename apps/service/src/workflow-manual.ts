import type * as Activity from "@supervisor/core/activity/stream";
import * as Errors from "@supervisor/core/errors";
import * as Facts from "@supervisor/core/fact/index";
import type { CameraEntry } from "@supervisor/core/lab-registry/camera";
import type * as Logger from "@supervisor/core/logger/logger";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as AndroidBridgeTracking from "./android-bridge/tracking";
import * as Capabilities from "./recovery/capabilities";
import * as Registry from "./registry";
import * as SuitestCamera from "./suitest/suitest-camera";

// Manual workflow run (via tRPC) riutilizza Capabilities.Env per gating e notifiche

export interface Env {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilitiesEnv: Capabilities.Env;
  readonly activityStream: Activity.ActivityStream;
  readonly factStream: Facts.FactFeed;
}

export const run =
  (env: Env) =>
  (cameraId: string, workflowName: string): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> => {
    const emit = (status: string): void =>
      env.activityStream.emit({ entityId: cameraId, source: "manual-workflow", status });

    // Manual runs can include awaitPredicate; facts keyed by videoCaptureDeviceId not adbId; missing link means no lookup
    const lookupFor = (camera: CameraEntry): Facts.FactLookup | undefined =>
      pipe(
        camera.videoCaptureDeviceId,
        O.map((id) => Facts.lookupFor(env.factStream, SuitestCamera.DOMAIN, id)),
        O.toUndefined,
      );

    return pipe(
      Registry.read(env.capabilitiesEnv.registryEnv),
      TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
      TE.flatMapOption(
        (db) =>
          pipe(
            O.fromNullable(db.lab.cameras[cameraId]),
            O.bindTo("camera"),
            O.bind("adbId", ({ camera }) => camera.adbId),
          ),
        () => WorkflowInterpreter.workflowError(`Camera "${cameraId}" has no ADB device assigned`),
      ),
      TE.tapIO(() => () => emit(`running:${workflowName}`)),
      TE.flatMap(({ camera, adbId }) =>
        WorkflowInterpreter.run(
          env.workflows,
          workflowName,
        )({
          logger: env.logger,
          workflows: env.workflows,
          capabilities: Capabilities.capabilitiesFor(AndroidBridgeTracking.DOMAIN, env.capabilitiesEnv)(adbId),
          probes: Capabilities.probesFor(AndroidBridgeTracking.DOMAIN, env.capabilitiesEnv)(adbId),
          lookup: lookupFor(camera),
        }),
      ),
      TE.tapIO(() => () => emit("succeeded")),
      TE.tapError((error) => TE.fromIO(() => emit(`failed: ${error.message}`))),
    );
  };
