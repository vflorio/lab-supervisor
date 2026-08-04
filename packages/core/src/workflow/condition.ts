import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import * as BooleanTree from "../boolean-tree/tree";
import { compileFactLeaf, type FactLeaf } from "../fact/condition";
import { type Effect, type WorkflowEnv, type WorkflowError, workflowError } from "./env";
import type { Orientation, ProbeName, Probes } from "./probe";

// Condition: boolean tree with facts + live device probes; effectful short-circuit evaluation

export interface ProbeLeaf {
  readonly type: "probe";
  readonly name: ProbeName;
  readonly args: readonly string[];
}

export type ConditionLeaf = FactLeaf | ProbeLeaf;

export type Condition = BooleanTree.BooleanTree<ConditionLeaf>;

// Re-export combinators so callers don't need to import BooleanTree
export const { and, or, not } = BooleanTree;

export const probe = (name: ProbeName, ...args: readonly string[]): Condition =>
  BooleanTree.leaf({ type: "probe", name, args });

// Fact constructors
export const ref = (name: string): Condition => BooleanTree.leaf({ type: "ref", name });

export const equals = (name: string, value: any): Condition => BooleanTree.leaf({ type: "equals", name, value });

export const includes = (name: string, value: string): Condition => BooleanTree.leaf({ type: "includes", name, value });

type ProbeResult = TE.TaskEither<WorkflowError, boolean>;

// Codec rejects missing args; this handles only hand-built conditions
const withArg = (leaf: ProbeLeaf, run: (arg: string) => ProbeResult): ProbeResult => {
  const [arg] = leaf.args;
  return arg === undefined ? TE.left(workflowError(`probe "${leaf.name}": missing required argument`)) : run(arg);
};

const runProbe = (leaf: ProbeLeaf, probes: Probes): ProbeResult =>
  match(leaf.name)
    .with("screenOn", () => probes.screenOn())
    .with("keyguardShowing", () => probes.keyguardShowing())
    .with("activityResumed", () => withArg(leaf, (activity) => probes.activityResumed(activity)))
    .with("orientation", () => withArg(leaf, (expected) => probes.orientation(expected as Orientation)))
    .exhaustive();

// Facts are pure (from env lookup); missing fact is an error, not false
const evaluateLeaf =
  (leaf: ConditionLeaf): Effect<boolean> =>
  ({ lookup, probes }: WorkflowEnv) => {
    if (leaf.type === "probe") {
      return probes
        ? runProbe(leaf, probes)
        : TE.left(workflowError(`probe "${leaf.name}": no probe capabilities available in this context`));
    }

    return lookup
      ? TE.right(compileFactLeaf(leaf)(lookup))
      : TE.left(workflowError(`predicate "${leaf.name}": no predicate lookup available in this context`));
  };

export const evaluate: (condition: Condition) => Effect<boolean> = BooleanTree.compileEffect(evaluateLeaf);

// Compact description for logs and error messages
export const describe = (condition: Condition): string =>
  match(condition)
    .with({ type: "leaf" }, ({ leaf }) =>
      leaf.type === "probe"
        ? `${leaf.name}${leaf.args.length > 0 ? `(${leaf.args.join(", ")})` : ""}`
        : `${leaf.type}:${leaf.name}`,
    )
    .with({ type: "and" }, ({ nodes }) => `(${nodes.map(describe).join(" and ")})`)
    .with({ type: "or" }, ({ nodes }) => `(${nodes.map(describe).join(" or ")})`)
    .with({ type: "not" }, ({ node }) => `not ${describe(node)}`)
    .exhaustive();
