import type { Condition } from "@supervisor/core/fact/condition";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import { FactLeafForm } from "./FactLeafForm";
import type { FactOption } from "./FactRefPicker";
import { conditionTreeOps, type FactLeaf } from "./ops";

const DEFAULT_LEAF: FactLeaf = { type: "ref", name: "" };

export interface FactExpressionFormProps {
  readonly value: Condition;
  readonly onChange: (next: Condition) => void;
  readonly factOptions: readonly FactOption[];
}

export function FactExpressionForm({ value, onChange, factOptions }: FactExpressionFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={conditionTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => (
        <FactLeafForm value={leaf} onChange={onLeafChange} factOptions={factOptions} />
      )}
    />
  );
}
