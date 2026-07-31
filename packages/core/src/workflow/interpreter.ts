import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { durationToMs } from "../date-time";
import { type AppError, format, of } from "../errors";
import type { Logger } from "../logger/logger";
import { compile as compileExpression, type PredicateExpression, type PredicateLookup } from "../predicates/expression";
import { PredicateExpressionCodec } from "../predicates/expression-codec";
import type { Command, TapCoords, Workflow } from "../workflow/workflow";
import { findWorkflow } from "../workflow/workflow";

export interface WorkflowEnv {
  readonly logger: Logger;
  readonly capabilities: CommandCapabilities;
  readonly workflows: readonly Workflow[];
  // Vista sui fatti applicativi correnti, per il solo comando `awaitPredicate`. Opzionale
  // perché non ogni contesto ne ha una da offrire: senza, il comando fallisce con un messaggio
  // esplicito invece di attendere a vuoto un predicate che nessuno aggiornerà mai.
  // Va letta ad ogni chiamata, non catturata: `awaitPredicate` aspetta proprio che cambi.
  readonly lookup?: PredicateLookup;
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

// `cause`: preserva l'errore sottostante *con il suo tag* attraverso il mapping generico che
// appiattisce tutto in un WorkflowError. Senza, un chiamante a valle non può più distinguere
// un trasporto ADB incastrato (CommandTimeout) da un comando fallito normalmente (es. app non
// trovata). Restando un AppError, ogni nuova regola di rimedio è un `.with({ type: "..." })` in più.
export interface WorkflowError extends AppError<"WorkflowError"> {
  readonly cause?: AppError;
}

export const workflowError = of("WorkflowError");

export type Effect<A> = RTE.ReaderTaskEither<WorkflowEnv, WorkflowError, A>;

const logInfo =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.info(message));

const logError =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.error(message));

// Riusa l'encoder del codec invece di un formatter dedicato: nel log l'espressione appare
// esattamente come è scritta in config.
const expressionToString = (expr: PredicateExpression): string => JSON.stringify(PredicateExpressionCodec.encode(expr));

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
    .with({ type: "sleep" }, ({ duration }) => `sleep(${duration})`)
    .with({ type: "awaitPredicate" }, ({ expr, timeout }) => `awaitPredicate(${expressionToString(expr)}, ${timeout})`)
    .exhaustive();

const liftCommand =
  (effect: (command: CommandCapabilities) => TE.TaskEither<WorkflowError, void>): Effect<void> =>
  ({ capabilities }) =>
    effect(capabilities);

const delay = (ms: number): TE.TaskEither<never, void> =>
  TE.fromTask(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

// Pausa pura: a differenza degli altri comandi, non passa da CommandCapabilities (nessuna
// interazione col device), non fallisce mai.
const sleep = (ms: number): Effect<void> => RTE.fromTaskEither(delay(ms));

// Cadenza di ricontrollo dei fatti: rileggere il lookup è in-memory e non costa nulla (chi
// aggiorna i fatti è il tracker, al proprio polling) - il bound reale è il timeout del comando,
// che va quindi dimensionato sul polling del tracker, non su questa costante.
const AWAIT_PREDICATE_POLL_MS = 1_000;

// A differenza di wait*, non interroga il device: attende che i tracker osservino il mondo
// cambiato. `deadline` è assoluta, così il tempo speso a valutare non erode il timeout.
const awaitPredicate =
  (expr: PredicateExpression, timeoutMs: number): Effect<void> =>
  ({ lookup }) => {
    if (!lookup) {
      return TE.left(
        workflowError(`awaitPredicate(${expressionToString(expr)}): no predicate lookup available in this context`),
      );
    }

    const satisfied = compileExpression(expr);
    const deadline = Date.now() + timeoutMs;

    const poll = (): TE.TaskEither<WorkflowError, void> => {
      if (satisfied(lookup)) return TE.right(undefined);

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return TE.left(workflowError(`awaitPredicate(${expressionToString(expr)}): still false after ${timeoutMs}ms`));
      }

      return pipe(delay(Math.min(AWAIT_PREDICATE_POLL_MS, remaining)), TE.flatMap(poll));
    };

    return poll();
  };

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
        .with({ type: "sleep" }, ({ duration }) => sleep(durationToMs(duration)))
        .with({ type: "awaitPredicate" }, ({ expr, timeout }) => awaitPredicate(expr, durationToMs(timeout)))
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

// Esegue un workflow per nome, risolto dall'elenco dei workflow disponibili
export const run = (workflows: readonly Workflow[], workflowName: string): Effect<void> => {
  const workflow = workflows.find((w) => w.name === workflowName);
  if (!workflow) return RTE.left(workflowError(`Workflow not found: "${workflowName}"`));

  return interpretWorkflow(workflow);
};
