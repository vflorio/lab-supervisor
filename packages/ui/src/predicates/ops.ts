import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import { match } from "ts-pattern";
import type { BooleanTreeOps } from "../boolean-tree/types";

export type PredicateLeaf = Extract<PredicateExpression, { type: "ref" | "equals" | "includes" }>;

export const predicateTreeOps: BooleanTreeOps<PredicateExpression, PredicateLeaf> = {
  and: (children) => ({ type: "and", exprs: children }),
  or: (children) => ({ type: "or", exprs: children }),
  not: (child) => ({ type: "not", expr: child }),
  leaf: (leaf) => leaf,
  match: (node, cases) =>
    match(node)
      .with({ type: "and" }, (n) => cases.and(n.exprs))
      .with({ type: "or" }, (n) => cases.or(n.exprs))
      .with({ type: "not" }, (n) => cases.not(n.expr))
      .otherwise((n) => cases.leaf(n)),
};
