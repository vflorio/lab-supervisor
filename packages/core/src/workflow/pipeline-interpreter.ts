import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import { match } from "ts-pattern";
import { type Effect, interpretCommands, type WorkflowEnv, workflowError } from "./interpreter";
import type { Pipeline } from "./pipeline";
import { findWorkflow, type Workflow } from "./workflow";

// -------------------------------------------------------------------------------------
// Interprete Pipeline: risolve un nome workflow, lo esegue e converte l'esito in booleano
// (successo -> true, comando fallito -> false: un tentativo di recovery fallito non è un
// errore). Un riferimento a un workflow inesistente resta invece un Left (config rotta).
// and/or sequenziano con short-circuit (rispettivamente su false/true, come &&/||); not nega.
// -------------------------------------------------------------------------------------

const interpretLeaf = (workflowName: string): Effect<boolean> =>
  pipe(
    RTE.asks<WorkflowEnv, readonly Workflow[]>((env) => env.workflows),
    RTE.flatMapEither((workflows) => findWorkflow(workflows, workflowName)),
    RTE.mapLeft((e) => workflowError(e.message)),
    RTE.flatMap((workflow) =>
      pipe(
        interpretCommands(workflow.commands),
        RTE.map(() => true),
        RTE.orElse(() => RTE.right(false)),
      ),
    ),
  );

// Tutti devono risolvere true, in sequenza; si ferma al primo false (come &&)
const interpretAnd = (pipelines: readonly Pipeline[], index: number): Effect<boolean> => {
  if (index >= pipelines.length) return RTE.right(true);

  return pipe(
    interpretPipeline(pipelines[index]!),
    RTE.flatMap((ok) => (ok ? interpretAnd(pipelines, index + 1) : RTE.right(false))),
  );
};

// Prova in sequenza, si ferma al primo true (come ||) - rimpiazza l'escalation primary/secondary
const interpretOr = (pipelines: readonly Pipeline[], index: number): Effect<boolean> => {
  if (index >= pipelines.length) return RTE.right(false);

  return pipe(
    interpretPipeline(pipelines[index]!),
    RTE.flatMap((ok) => (ok ? RTE.right(true) : interpretOr(pipelines, index + 1))),
  );
};

export const interpretPipeline = (pipeline: Pipeline): Effect<boolean> =>
  match(pipeline)
    .with({ type: "workflow" }, ({ workflowName }) => interpretLeaf(workflowName))
    .with({ type: "and" }, ({ pipelines }) => interpretAnd(pipelines, 0))
    .with({ type: "or" }, ({ pipelines }) => interpretOr(pipelines, 0))
    .with({ type: "not" }, ({ pipeline: inner }) =>
      pipe(
        interpretPipeline(inner),
        RTE.map((ok) => !ok),
      ),
    )
    .exhaustive();
