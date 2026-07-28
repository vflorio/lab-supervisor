import * as Adb from "@supervisor/core/adapters/adb/shell";
import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import * as Retry from "@supervisor/core/retry/retry";
import type * as Shell from "@supervisor/core/shell";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type * as DeviceRegistry from "./registry";

const mapWorkflowError = (
  error: WorkflowInterpreter.WorkflowError | Adb.Error | Shell.ShellSpawnError | DeviceRegistry.SyncError,
): WorkflowInterpreter.WorkflowError => ({
  ...WorkflowInterpreter.workflowError(error.message),
  // Preserva il segnale "il comando non ha mai risposto" - vedi WorkflowError#timedOut
  timedOut: error.type === "CommandTimeout",
});

// Bound per waitForActivity: Retry.constantDelay da solo non esaurisce mai (vedi retry/retry.ts),
// senza limitRetries un'activity che non torna mai in foreground (app crashata, nome sbagliato,
// ecc.) farebbe girare il polling per sempre.
const WAIT_FOR_ACTIVITY_POLL_MS = 1_000;
const WAIT_FOR_ACTIVITY_TIMEOUT_MS = 30_000;

const waitForActivityPolicy = pipe(
  Retry.constantDelay(WAIT_FOR_ACTIVITY_POLL_MS),
  Retry.concat(Retry.limitRetries(Math.ceil(WAIT_FOR_ACTIVITY_TIMEOUT_MS / WAIT_FOR_ACTIVITY_POLL_MS))),
);

export interface WorkflowRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly spawn: Shell.Spawn;
}

export type RunError = WorkflowInterpreter.WorkflowError;

export const run =
  (env: WorkflowRunnerEnv) =>
  (workflow: string) =>
  (target: Network.Endpoint): TE.TaskEither<RunError, void> =>
    pipe(
      WorkflowInterpreter.run(
        env.workflows,
        workflow,
      )({
        logger: env.logger,
        workflows: env.workflows,
        capabilities: makeCapabilities(env, target),
      }),

      TE.tapIO(() => env.logger.info(`Workflow "${workflow}" completed on ${Network.format(target)}`)),
      TE.tapError((error) =>
        TE.fromIO(env.logger.error(`Workflow failed on ${Network.format(target)}: ${Errors.format(error)}`)),
      ),
    );

export const makeCapabilities = (
  env: WorkflowRunnerEnv,
  target: Network.Endpoint,
): WorkflowInterpreter.CommandCapabilities => {
  const adbEnv: Adb.AdbEnv = {
    logger: env.logger.child("ADB"),
    spawn: env.spawn,
  };

  return {
    // Restart Application (AM)
    restartApp: (packageId) => pipe(Adb.restartApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Ensure app is in foreground - launch only if not already resumed
    ensureActivity: (packageId, activity) =>
      pipe(
        Adb.isActivityResumed(activity)(target)(adbEnv),
        TE.mapLeft(mapWorkflowError),
        TE.flatMap((active) =>
          active ? TE.right(undefined) : pipe(Adb.launchApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
        ),
      ),

    // Open URL in default browser
    openUrl: (url) => pipe(Adb.openUrl(url)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Open "Wireless debugging" settings screen (System > Developer options)
    openDeveloperSettings: () => pipe(Adb.openDeveloperSettings(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Reboot Device
    reboot: () => pipe(Adb.reboot(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wake screen + dismiss keyguard (no PIN)
    wakeUp: () =>
      pipe(
        Adb.wakeUp(target)(adbEnv),
        TE.flatMap(() => Adb.dismissKeyguard(target)(adbEnv)),
        TE.mapLeft(mapWorkflowError),
      ),

    // Emulates screen tap
    inputTap: (coords) => pipe(Adb.inputTap(coords.x, coords.y)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wait for ADB status "device"
    waitForDevice: () => pipe(Adb.waitForDevice(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Wait for activity to be foreground
    waitForActivity: (activity) =>
      pipe(
        Retry.retrying(
          waitForActivityPolicy,
          env.logger,
        )(
          pipe(
            Adb.isActivityResumed(activity)(target)(adbEnv),
            TE.mapLeft(mapWorkflowError),
            TE.flatMap((active) =>
              active
                ? TE.right(undefined)
                : TE.left(WorkflowInterpreter.workflowError(`Activity "${activity}" not yet resumed`)),
            ),
          ),
        ),
      ),
  };
};
