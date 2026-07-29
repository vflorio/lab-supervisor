import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import type { BooleanTreeOps } from "../boolean-tree/types";

export type PipelineLeaf = Extract<Pipeline, { type: "workflow" }>;

export const pipelineTreeOps: BooleanTreeOps<Pipeline, PipelineLeaf> = {
  match: (node, cases) => {
    switch (node.type) {
      case "and":
        return cases.and(node.pipelines);
      case "or":
        return cases.or(node.pipelines);
      case "not":
        return cases.not(node.pipeline);
      default:
        return cases.leaf(node);
    }
  },
  and: (children) => ({ type: "and", pipelines: children }),
  or: (children) => ({ type: "or", pipelines: children }),
  not: (child) => ({ type: "not", pipeline: child }),
  leaf: (leaf) => leaf,
};
