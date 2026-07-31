import type { Condition, ConditionLeaf } from "@supervisor/core/workflow/condition";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { ConditionLeafForm } from "./ConditionLeafForm";
import { conditionTreeOps } from "./ops";

const DEFAULT_LEAF: ConditionLeaf = { type: "ref", name: "" };

export interface ConditionFormProps {
  readonly value: Condition;
  readonly onChange: (next: Condition) => void;
  readonly predicateOptions: readonly PredicateOption[];
}

export function ConditionForm({ value, onChange, predicateOptions }: ConditionFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={conditionTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => (
        <ConditionLeafForm value={leaf} onChange={onLeafChange} predicateOptions={predicateOptions} />
      )}
    />
  );
}
