import * as Adb from "@supervisor/core/adapters/adb/shell";
import type * as Logger from "@supervisor/core/logger/logger";
import type * as Network from "@supervisor/core/network";
import type * as Shell from "@supervisor/core/shell";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type * as WorkflowProbe from "@supervisor/core/workflow/probe";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import type * as DeviceRegistry from "../registry";

const mapWorkflowError = (
  error: WorkflowInterpreter.WorkflowError | Adb.Error | Shell.ShellSpawnError | DeviceRegistry.SyncError,
): WorkflowInterpreter.WorkflowError => ({
  ...WorkflowInterpreter.workflowError(error.message),
  // Preserve original error tag (e.g., CommandTimeout) in WorkflowError#cause
  cause: error,
});

export interface Env {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly spawn: Shell.Spawn;
}

export const makeCommands = (env: Env, target: Network.Endpoint): WorkflowInterpreter.Commands => {
  const adbEnv: Adb.AdbEnv = {
    logger: env.logger.child("ADB"),
    spawn: env.spawn,
  };

  return {
    restartApp: (packageId) => pipe(Adb.restartApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    ensureActivity: (packageId, activity) =>
      pipe(
        Adb.isActivityResumed(activity)(target)(adbEnv),
        TE.mapLeft(mapWorkflowError),
        TE.flatMap((active) =>
          active ? TE.right(undefined) : pipe(Adb.launchApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
        ),
      ),
    launchApp: (packageId) => pipe(Adb.launchApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    forceStopApp: (packageId) => pipe(Adb.forceStopApp(packageId)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    dismissKeyguard: () => pipe(Adb.dismissKeyguard(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    openUrl: (url) => pipe(Adb.openUrl(url)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    openDeveloperSettings: () => pipe(Adb.openDeveloperSettings(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    reboot: () => pipe(Adb.reboot(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    // Swipe solo se il lockscreen c'è davvero: su schermo già sbloccato dismissKeyguard
    // scrolla l'app in foreground (vedi ../../../../packages/core/src/workflow/probe.ts)
    wakeUp: () =>
      pipe(
        Adb.wakeUp(target)(adbEnv),
        TE.flatMap(() => Adb.isKeyguardShowing(target)(adbEnv)),
        TE.flatMap((showing) => (showing ? Adb.dismissKeyguard(target)(adbEnv) : TE.right(undefined))),
        TE.mapLeft(mapWorkflowError),
      ),
    inputTap: (coords) => pipe(Adb.inputTap(coords.x, coords.y)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
    waitForDevice: () => pipe(Adb.waitForDevice(target)(adbEnv), TE.mapLeft(mapWorkflowError)),
  };
};

// Probes (read-only capability); il gating non serve nelle letture
export const makeProbes = (env: Env, target: Network.Endpoint): WorkflowProbe.Probes => {
  const adbEnv: Adb.AdbEnv = {
    logger: env.logger.child("ADB"),
    spawn: env.spawn,
  };

  return {
    screenOn: () => pipe(Adb.isScreenOn(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    keyguardShowing: () => pipe(Adb.isKeyguardShowing(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    activityResumed: (activity) => pipe(Adb.isActivityResumed(activity)(target)(adbEnv), TE.mapLeft(mapWorkflowError)),

    // Unreadable orientation is an error, not a mismatch (see probe rules)
    orientation: (expected) =>
      pipe(
        Adb.getOrientation(target)(adbEnv),
        TE.mapLeft(mapWorkflowError),
        TE.flatMap(
          O.match(
            () => TE.left(WorkflowInterpreter.workflowError("orientation: device did not report SurfaceOrientation")),
            (actual) => TE.right(actual === expected),
          ),
        ),
      ),
  };
};
