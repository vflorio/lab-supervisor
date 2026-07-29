import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import { type PredicateLeaf, predicateTreeOps } from "./ops";
import { PredicateLeafForm } from "./PredicateLeafForm";

const DEFAULT_LEAF: PredicateLeaf = { type: "ref", name: "" };

// Form controllata per una PredicateExpression: albero and/or/not generico
// (vedi ../boolean-tree) con leaf ref/equals/includes editati da PredicateLeafForm.
export interface PredicateExpressionFormProps {
  readonly value: PredicateExpression;
  readonly onChange: (next: PredicateExpression) => void;
}

export function PredicateExpressionForm({ value, onChange }: PredicateExpressionFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={predicateTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => <PredicateLeafForm value={leaf} onChange={onLeafChange} />}
    />
  );
}
1;
