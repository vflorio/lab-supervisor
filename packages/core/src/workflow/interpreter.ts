import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { durationToMs } from "../date-time";
import { format } from "../errors";
import * as Condition from "./condition";
import {
  type CommandCapabilities,
  type Effect,
  MAX_WORKFLOW_DEPTH,
  type WorkflowEnv,
  type WorkflowError,
  workflowError,
} from "./env";
import type { Command, Workflow } from "./workflow";
import { findWorkflow } from "./workflow";

// Re-export env & error types from ./env
export * from "./env";

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
    .with({ type: "run" }, ({ workflowName }) => `run(${workflowName})`)
    .with({ type: "sleep" }, ({ duration }) => `sleep(${duration})`)
    .with({ type: "await" }, ({ condition, timeout }) => `await(${Condition.describe(condition)}, ${timeout})`)
    .with(
      { type: "when" },
      ({ condition, thenWorkflow, elseWorkflow }) =>
        `when(${Condition.describe(condition)} -> ${thenWorkflow}${elseWorkflow ? ` else ${elseWorkflow}` : ""})`,
    )
    .exhaustive();

const liftCommand =
  (effect: (command: CommandCapabilities) => TE.TaskEither<WorkflowError, void>): Effect<void> =>
  ({ capabilities }) =>
    effect(capabilities);

const delay = (ms: number): TE.TaskEither<never, void> =>
  TE.fromTask(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

// Pure pause: no device interaction, never fails
const sleep = (ms: number): Effect<void> => RTE.fromTaskEither(delay(ms));

// Poll rate for await; actual bound is the user-set timeout (sized to tracker polling, not this constant)
const AWAIT_POLL_MS = 1_000;

// Wait for condition; absolute deadline so evaluation time doesn't erode timeout
const await_ = (condition: Condition.Condition, timeoutMs: number): Effect<void> => {
  const satisfied = Condition.evaluate(condition);
  const timedOut = workflowError(
    `await(${Condition.describe(condition)}): still false after ${timeoutMs}ms`,
  ) as WorkflowError;

  return (env: WorkflowEnv) => {
    const deadline = Date.now() + timeoutMs;

    const poll = (): TE.TaskEither<WorkflowError, void> =>
      pipe(
        satisfied(env),
        TE.flatMap((ok) => {
          if (ok) return TE.right(undefined);

          const remaining = deadline - Date.now();
          if (remaining <= 0) return TE.left(timedOut);

          return pipe(delay(Math.min(AWAIT_POLL_MS, remaining)), TE.flatMap(poll));
        }),
      );

    return poll();
  };
};

// Run nested workflow with depth tracking to prevent cycles
const runNested = (workflowName: string): Effect<void> =>
  pipe(
    RTE.ask<WorkflowEnv, WorkflowError>(),
    RTE.flatMap((env) => {
      const depth = (env.depth ?? 0) + 1;
      if (depth > MAX_WORKFLOW_DEPTH) {
        return RTE.left<WorkflowEnv, WorkflowError, void>(
          workflowError(`Workflow nesting too deep (>${MAX_WORKFLOW_DEPTH}) at "${workflowName}": cyclic run/when?`),
        );
      }

      return pipe(
        RTE.fromEither(findWorkflow(env.workflows, workflowName)),
        RTE.mapLeft((e) => workflowError(e.message)),
        RTE.flatMap((workflow) =>
          RTE.local<WorkflowEnv, WorkflowEnv>(() => ({ ...env, depth }))(interpretCommands(workflow.commands)),
        ),
      );
    }),
  );

// Condition failures are Left, not silent fallback to else (see ./condition.ts)
const when = (condition: Condition.Condition, thenWorkflow: string, elseWorkflow?: string): Effect<void> =>
  pipe(
    Condition.evaluate(condition),
    RTE.flatMap((ok) => {
      const branch = ok ? thenWorkflow : elseWorkflow;
      return branch === undefined ? RTE.right<WorkflowEnv, WorkflowError, void>(undefined) : runNested(branch);
    }),
  );

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
        .with({ type: "run" }, ({ workflowName }) => runNested(workflowName))
        .with({ type: "sleep" }, ({ duration }) => sleep(durationToMs(duration)))
        .with({ type: "await" }, ({ condition, timeout }) => await_(condition, durationToMs(timeout)))
        .with({ type: "when" }, ({ condition, thenWorkflow, elseWorkflow }) =>
          when(condition, thenWorkflow, elseWorkflow),
        )
        .exhaustive(),
    ),
    RTE.tapError((error) => logError(`  X ${commandToString(cmd)} failed: ${format(error)}`)),
  );

// Interpret commands in sequence
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

// Run workflow's command sequence
export const interpretWorkflow = (workflow: Workflow): Effect<void> => interpretCommands(workflow.commands);

// Run workflow by name from the workflow list
export const run = (workflows: readonly Workflow[], workflowName: string): Effect<void> => {
  const workflow = workflows.find((w) => w.name === workflowName);
  if (!workflow) return RTE.left(workflowError(`Workflow not found: "${workflowName}"`));

  return interpretWorkflow(workflow);
};
