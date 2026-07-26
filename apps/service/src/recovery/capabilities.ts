import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as Registry from "../registry";
import * as Workflow from "../workflow";
import { resolveTarget } from "./target";

// -------------------------------------------------------------------------------------
// CommandCapabilities per una RecoveryPolicy: risolve il target ADB dell'entityId (via
// resolveTarget) leggendo il registry FRESCO ad ogni singolo comando eseguito, mai da una
// cache - il registry è già economico da leggere (Registry.read, mai Registry.sync qui) e una
// pipeline di recovery esegue pochi comandi per tentativo, quindi non serve alcun loop/cache
// dedicato solo per questo.
// -------------------------------------------------------------------------------------

export interface Env {
  readonly logger: Logger.Tagged;
  readonly registryEnv: Registry.RegistrySyncEnv;
  readonly workflowEnv: Workflow.WorkflowRunnerEnv;
}

export const capabilitiesFor =
  (domain: string, env: Env) =>
  (entityId: string): WorkflowInterpreter.CommandCapabilities => {
    const withTarget = <A>(
      run: (
        capabilities: WorkflowInterpreter.CommandCapabilities,
      ) => TE.TaskEither<WorkflowInterpreter.WorkflowError, A>,
    ): TE.TaskEither<WorkflowInterpreter.WorkflowError, A> =>
      pipe(
        Registry.read(env.registryEnv),
        TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
        TE.flatMapOption(
          (db) => resolveTarget(domain, entityId, db.lab),
          () => WorkflowInterpreter.workflowError(`No ADB target resolved for ${domain}/${entityId}`),
        ),
        TE.map((target) => Workflow.makeCapabilities(env.workflowEnv, target)),
        TE.flatMap(run),
      );

    return {
      restartApp: (packageId) => withTarget((c) => c.restartApp(packageId)),
      ensureActivity: (packageId, activity) => withTarget((c) => c.ensureActivity(packageId, activity)),
      openUrl: (url) => withTarget((c) => c.openUrl(url)),
      openDeveloperSettings: () => withTarget((c) => c.openDeveloperSettings()),
      reboot: () => withTarget((c) => c.reboot()),
      wakeUp: () => withTarget((c) => c.wakeUp()),
      inputTap: (coords) => withTarget((c) => c.inputTap(coords)),
      waitForDevice: () => withTarget((c) => c.waitForDevice()),
      waitForActivity: (activity) => withTarget((c) => c.waitForActivity(activity)),
    };
  };
