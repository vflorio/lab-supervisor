import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import { type PredicateLeaf, predicateTreeOps } from "./ops";
import { PredicateLeafForm } from "./PredicateLeafForm";
import type { PredicateOption } from "./PredicateRefPicker";

const DEFAULT_LEAF: PredicateLeaf = { type: "ref", name: "" };

export interface PredicateExpressionFormProps {
  readonly value: PredicateExpression;
  readonly onChange: (next: PredicateExpression) => void;
  readonly predicateOptions: readonly PredicateOption[];
}

export function PredicateExpressionForm({ value, onChange, predicateOptions }: PredicateExpressionFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={predicateTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => (
        <PredicateLeafForm value={leaf} onChange={onLeafChange} predicateOptions={predicateOptions} />
      )}
    />
  );
}
