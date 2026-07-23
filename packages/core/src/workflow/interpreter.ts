import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { type AppError, format, of } from "../errors";
import type { Logger } from "../logger";
import type { Command, TapCoords, Workflow } from "../workflow/workflow";
import { findWorkflow } from "../workflow/workflow";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface WorkflowEnv {
  readonly logger: Logger;
  readonly capabilities: CommandCapabilities;
  readonly workflows: readonly Workflow[];
}

export interface CommandCapabilities {
  readonly restartApp: (packageId: string) => TE.TaskEither<WorkflowError, void>;
  readonly ensureActivity: (packageId: string, activity: string) => TE.TaskEither<WorkflowError, void>;
  readonly openUrl: (url: string) => TE.TaskEither<WorkflowError, void>;
  readonly openDeveloperSettings: () => TE.TaskEither<WorkflowError, void>;
  readonly reboot: () => TE.TaskEither<WorkflowError, void>;
  readonly wakeUp: () => TE.TaskEither<WorkflowError, void>;
  readonly inputTap: (coords: TapCoords) => TE.TaskEither<WorkflowError, void>;
  readonly waitForDevice: () => TE.TaskEither<WorkflowError, void>;
  readonly waitForActivity: (activity: string) => TE.TaskEither<WorkflowError, void>;
}

// -------------------------------------------------------------------------------------
// Error
// -------------------------------------------------------------------------------------

export interface WorkflowError extends AppError<"WorkflowError"> {}

export const workflowError = of("WorkflowError");

// -------------------------------------------------------------------------------------
// Effect type
// -------------------------------------------------------------------------------------

export type Effect<A> = RTE.ReaderTaskEither<WorkflowEnv, WorkflowError, A>;

// -------------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------------

const logInfo =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.info(message));

const logError =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.error(message));

const commandToString = (cmd: Command): string =>
  match(cmd)
    .with({ type: "restartApp" }, ({ packageId }) => `restartApp(${packageId})`)
    .with({ type: "ensureActivity" }, ({ packageId, activity }) => `ensureActivity(${packageId}, ${activity})`)
    .with({ type: "openUrl" }, ({ url }) => `openUrl(${url})`)
    .with({ type: "openDeveloperSettings" }, () => "openDeveloperSettings")
    .with({ type: "reboot" }, () => "reboot")
    .with({ type: "wakeUp" }, () => "wakeUp")
    .with({ type: "inputTap" }, ({ coords }) => `inputTap(${coords.x}, ${coords.y})`)
    .with({ type: "waitForDevice" }, () => "waitForDevice")
    .with({ type: "waitForActivity" }, ({ activity }) => `waitForActivity(${activity})`)
    .with({ type: "run" }, ({ workflowName }) => `run(${workflowName})`)
    .exhaustive();

const liftCommand =
  (effect: (command: CommandCapabilities) => TE.TaskEither<WorkflowError, void>): Effect<void> =>
  ({ capabilities }) =>
    effect(capabilities);

// -------------------------------------------------------------------------------------
// Interpreters
// -------------------------------------------------------------------------------------

const interpretCommand = (cmd: Command): Effect<void> =>
  pipe(
    logInfo(`  -> ${commandToString(cmd)}`),
    RTE.flatMap(() =>
      match(cmd)
        .with({ type: "restartApp" }, ({ packageId }) => liftCommand((c) => c.restartApp(packageId)))
        .with({ type: "ensureActivity" }, ({ packageId, activity }) =>
          liftCommand((c) => c.ensureActivity(packageId, activity)),
        )
        .with({ type: "openUrl" }, ({ url }) => liftCommand((c) => c.openUrl(url)))
        .with({ type: "openDeveloperSettings" }, () => liftCommand((c) => c.openDeveloperSettings()))
        .with({ type: "reboot" }, () => liftCommand((c) => c.reboot()))
        .with({ type: "wakeUp" }, () => liftCommand((c) => c.wakeUp()))
        .with({ type: "inputTap" }, ({ coords }) => liftCommand((c) => c.inputTap(coords)))
        .with({ type: "waitForDevice" }, () => liftCommand((c) => c.waitForDevice()))
        .with({ type: "waitForActivity" }, ({ activity }) => liftCommand((c) => c.waitForActivity(activity)))
        .with({ type: "run" }, ({ workflowName }) =>
          pipe(
            RTE.asks<WorkflowEnv, readonly Workflow[]>((env) => env.workflows),
            RTE.flatMapEither((workflows) => findWorkflow(workflows, workflowName)),
            RTE.mapLeft((e) => workflowError(e.message)),
            RTE.flatMap((workflow) => interpretCommands(workflow.commands)),
          ),
        )
        .exhaustive(),
    ),
    RTE.tapError((error) => logError(`  X ${commandToString(cmd)} failed: ${format(error)}`)),
  );

// Interpreta una sequenza di comandi in ordine
export const interpretCommands = (commands: readonly Command[]): Effect<void> =>
  pipe(
    commands.reduce<Effect<void>>(
      (acc, cmd) =>
        pipe(
          acc,
          RTE.flatMap(() => interpretCommand(cmd)),
        ),
      RTE.right(undefined),
    ),
  );

// Esegue un workflow (la sua sequenza piatta di comandi, in ordine)
export const interpretWorkflow = (workflow: Workflow): Effect<void> => interpretCommands(workflow.commands);

// -------------------------------------------------------------------------------------
// Recovery runner
// -------------------------------------------------------------------------------------

// Esegue un workflow per nome, risolto dall'elenco dei workflow disponibili
export const run = (workflows: readonly Workflow[], workflowName: string): Effect<void> => {
  const workflow = workflows.find((w) => w.name === workflowName);
  if (!workflow) return RTE.left(workflowError(`Workflow not found: "${workflowName}"`));

  return interpretWorkflow(workflow);
};
