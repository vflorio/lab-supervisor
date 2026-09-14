import type * as Activity from "@supervisor/core/activity/stream";
import * as Errors from "@supervisor/core/errors";
import * as Facts from "@supervisor/core/fact/index";
import type { CameraEntry } from "@supervisor/core/lab-registry/camera";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
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

    const liveAdbEntityId = (ip: Network.IP): O.Option<string> =>
      pipe(
        env.factStream.snapshot(),
        RA.findFirst(
          (entry) =>
            entry.domain === AndroidBridgeTracking.DOMAIN &&
            entry.name === "adb_device_reachable" &&
            entry.value === true &&
            pipe(
              Network.decode(entry.entityId),
              E.map((endpoint) => Network.EqIP.equals(endpoint.ip, ip)),
              E.getOrElse(() => false),
            ),
        ),
        O.map((entry) => entry.entityId),
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
            O.bind("adbIp", ({ adbId }) => O.fromNullable(db.lab.adb[adbId]?.target.ip)),
            O.bind("entityId", ({ adbIp }) => liveAdbEntityId(adbIp)),
          ),
        () =>
          WorkflowInterpreter.workflowError(
            `Camera "${cameraId}" has no ADB device assigned, or it is not currently reachable`,
          ),
      ),
      TE.tapIO(() => () => emit(`running:${workflowName}`)),
      TE.flatMap(({ camera, entityId }) =>
        WorkflowInterpreter.run(
          env.workflows,
          workflowName,
        )({
          logger: env.logger,
          workflows: env.workflows,
          commands: Capabilities.commandsFor(AndroidBridgeTracking.DOMAIN, env.capabilitiesEnv)(entityId),
          probes: Capabilities.probesFor(AndroidBridgeTracking.DOMAIN, env.capabilitiesEnv)(entityId),
          lookup: lookupFor(camera),
        }),
      ),
      TE.tapIO(() => () => emit("succeeded")),
      TE.tapError((error) => TE.fromIO(() => emit(`failed: ${error.message}`))),
    );
  };
