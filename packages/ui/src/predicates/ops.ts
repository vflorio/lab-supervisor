import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import type { BooleanTreeOps } from "../boolean-tree/types";

export type PredicateLeaf = Extract<PredicateExpression, { type: "ref" | "equals" | "includes" }>;

export const predicateTreeOps: BooleanTreeOps<PredicateExpression, PredicateLeaf> = {
  match: (node, cases) => {
    switch (node.type) {
      case "and":
        return cases.and(node.exprs);
      case "or":
        return cases.or(node.exprs);
      case "not":
        return cases.not(node.expr);
      default:
        return cases.leaf(node);
    }
  },
  and: (children) => ({ type: "and", exprs: children }),
  or: (children) => ({ type: "or", exprs: children }),
  not: (child) => ({ type: "not", expr: child }),
  leaf: (leaf) => leaf,
};
