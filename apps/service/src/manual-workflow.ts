import type * as Activity from "@supervisor/core/activity/stream";
import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as AdbTracking from "./adb/adb-tracking";
import * as Capabilities from "./recovery/capabilities";
import * as Registry from "./registry";

// Lancio manuale (operatore, via tRPC) di un workflow contro una camera - a differenza di
// RecoveryEngine, non è agganciato a nessun tripwire: risolve solo `cameraId -> adbId` dal
// registry, poi riusa la stessa Capabilities.Env delle RecoveryPolicy (gating AndroidBridge,
// notifica bridge su reboot/timeout) così un lancio manuale ha le stesse garanzie di uno automatico.

export interface Env {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilitiesEnv: Capabilities.Env;
  readonly activityStream: Activity.ActivityStream;
}

export const run =
  (env: Env) =>
  (cameraId: string, workflowName: string): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> => {
    const emit = (status: string): void =>
      env.activityStream.emit({ entityId: cameraId, source: "manual-workflow", status });

    return pipe(
      Registry.read(env.capabilitiesEnv.registryEnv),
      TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
      TE.flatMapOption(
        (db) =>
          pipe(
            O.fromNullable(db.lab.cameras[cameraId]),
            O.chain((camera) => camera.adbId),
          ),
        () => WorkflowInterpreter.workflowError(`Camera "${cameraId}" has no ADB device assigned`),
      ),
      TE.tapIO(() => () => emit(`running:${workflowName}`)),
      TE.flatMap((adbId) =>
        WorkflowInterpreter.run(
          env.workflows,
          workflowName,
        )({
          logger: env.logger,
          workflows: env.workflows,
          capabilities: Capabilities.capabilitiesFor(AdbTracking.DOMAIN, env.capabilitiesEnv)(adbId),
        }),
      ),
      TE.tapIO(() => () => emit("succeeded")),
      TE.tapError((error) => TE.fromIO(() => emit(`failed: ${error.message}`))),
    );
  };
