import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import { match } from "ts-pattern";
import * as Condition from "./condition";
import { type Effect, interpretCommands, type WorkflowEnv, workflowError } from "./interpreter";
import type { Pipeline } from "./pipeline";
import { findWorkflow, type Workflow } from "./workflow";

// Look up workflow by name, execute, convert outcome to bool (failure ≠ error); unknown workflow is Left (config error)

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

// All must resolve true in sequence; stops at first false (like &&)
const interpretAnd = (pipelines: readonly Pipeline[], index: number): Effect<boolean> => {
  if (index >= pipelines.length) return RTE.right(true);

  return pipe(
    interpretPipeline(pipelines[index]!),
    RTE.flatMap((ok) => (ok ? interpretAnd(pipelines, index + 1) : RTE.right(false))),
  );
};

// Try in sequence; stops at first true (like ||)
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
    // Like workflow leaves: config errors are Left, probe failures are not; unevaluable condition becomes false
    .with({ type: "condition" }, ({ condition }) =>
      pipe(
        Condition.evaluate(condition),
        RTE.orElse(() => RTE.right(false)),
      ),
    )
    .with({ type: "and" }, ({ pipelines }) => interpretAnd(pipelines, 0))
    .with({ type: "or" }, ({ pipelines }) => interpretOr(pipelines, 0))
    .with({ type: "not" }, ({ pipeline: inner }) =>
      pipe(
        interpretPipeline(inner),
        RTE.map((ok) => !ok),
      ),
    )
    .exhaustive();
