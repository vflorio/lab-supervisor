import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import { BooleanTreeView } from "../boolean-tree/BooleanTreeView";
import { predicateTreeOps } from "./ops";
import { PredicateLeafView } from "./PredicateLeafView";

// Readonly: albero and/or/not generico (vedi ../boolean-tree) con leaf renderizzati da
// PredicateLeafView.
export interface PredicateExpressionViewProps {
  readonly value: PredicateExpression;
}

export function PredicateExpressionView({ value }: PredicateExpressionViewProps) {
  return (
    <BooleanTreeView value={value} ops={predicateTreeOps} renderLeaf={(leaf) => <PredicateLeafView value={leaf} />} />
  );
}
