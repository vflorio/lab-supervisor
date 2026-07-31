import type { FactLeaf, PredicateExpression } from "@supervisor/core/predicates/expression";
import { booleanTreeOps } from "../boolean-tree/ops";
import type { BooleanTreeOps } from "../boolean-tree/types";

export type PredicateLeaf = FactLeaf;

export const predicateTreeOps: BooleanTreeOps<PredicateExpression, PredicateLeaf> = booleanTreeOps<PredicateLeaf>();
