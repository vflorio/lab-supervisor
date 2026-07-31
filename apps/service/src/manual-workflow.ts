import type * as Activity from "@supervisor/core/activity/stream";
import * as Errors from "@supervisor/core/errors";
import type { CameraEntry } from "@supervisor/core/lab-registry/camera";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as AdbTracking from "./adb/adb-tracking";
import * as Capabilities from "./recovery/capabilities";
import * as Registry from "./registry";
import * as SuitestCamera from "./suitest/suitest-camera";

// Lancio manuale (operatore, via tRPC) di un workflow contro una camera - a differenza di
// RecoveryEngine, non è agganciato a nessun tripwire: risolve solo `cameraId -> adbId` dal
// registry, poi riusa la stessa Capabilities.Env delle RecoveryPolicy (gating AndroidBridge,
// notifica bridge su reboot/timeout) così un lancio manuale ha le stesse garanzie di uno automatico.

export interface Env {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilitiesEnv: Capabilities.Env;
  readonly activityStream: Activity.ActivityStream;
  readonly predicateStream: Predicates.PredicateFeed;
}

export const run =
  (env: Env) =>
  (cameraId: string, workflowName: string): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> => {
    const emit = (status: string): void =>
      env.activityStream.emit({ entityId: cameraId, source: "manual-workflow", status });

    // Anche un lancio manuale può contenere `awaitPredicate`: senza lookup lo stesso workflow
    // funzionerebbe da recovery e fallirebbe dall'UI. I fatti di una camera stanno nel dominio
    // Suitest, indicizzati per videoCaptureDeviceId - non per l'adbId con cui si risolve il
    // target ADB. Una camera senza quel legame non ha fatti da attendere: nessun lookup, e il
    // comando fallisce dicendo perché invece di aspettare a vuoto.
    const lookupFor = (camera: CameraEntry): Predicates.PredicateLookup | undefined =>
      pipe(
        camera.videoCaptureDeviceId,
        O.map((id) => Predicates.lookupFor(env.predicateStream, SuitestCamera.DOMAIN, id)),
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
          capabilities: Capabilities.capabilitiesFor(AdbTracking.DOMAIN, env.capabilitiesEnv)(adbId),
          lookup: lookupFor(camera),
        }),
      ),
      TE.tapIO(() => () => emit("succeeded")),
      TE.tapError((error) => TE.fromIO(() => emit(`failed: ${error.message}`))),
    );
  };
