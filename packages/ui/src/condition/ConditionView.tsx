import type { Condition } from "@supervisor/core/workflow/condition";
import { BooleanTreeView } from "../boolean-tree/BooleanTreeView";
import { ConditionLeafView } from "./ConditionLeafView";
import { conditionTreeOps } from "./ops";

// Readonly: albero and/or/not generico (vedi ../boolean-tree) con leaf renderizzati da
// ConditionLeafView.
export interface ConditionViewProps {
  readonly value: Condition;
}

export function ConditionView({ value }: ConditionViewProps) {
  return (
    <BooleanTreeView value={value} ops={conditionTreeOps} renderLeaf={(leaf) => <ConditionLeafView value={leaf} />} />
  );
}
