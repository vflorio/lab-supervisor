import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { match } from "ts-pattern";
import type { BooleanTreeOps } from "../boolean-tree/types";

export type PipelineLeaf = Extract<Pipeline, { type: "workflow" | "condition" }>;

export const pipelineTreeOps: BooleanTreeOps<Pipeline, PipelineLeaf> = {
  match: (node, cases) =>
    match(node)
      .with({ type: "and" }, (and) => cases.and(and.pipelines))
      .with({ type: "or" }, (or) => cases.or(or.pipelines))
      .with({ type: "not" }, (not) => cases.not(not.pipeline))
      .with({ type: "workflow" }, { type: "condition" }, (leaf) => cases.leaf(leaf))
      .exhaustive(),
  and: (children) => ({ type: "and", pipelines: children }),
  or: (children) => ({ type: "or", pipelines: children }),
  not: (child) => ({ type: "not", pipeline: child }),
  leaf: (leaf) => leaf,
};
