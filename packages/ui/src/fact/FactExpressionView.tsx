import type { Condition } from "@supervisor/core/fact/condition";
import { BooleanTreeView } from "../boolean-tree/BooleanTreeView";
import { FactLeafView } from "./FactLeafView";
import { conditionTreeOps } from "./ops";

// Readonly: albero and/or/not generico (vedi ../boolean-tree) con leaf renderizzati da
// FactLeafView.
export interface FactExpressionViewProps {
  readonly value: Condition;
}

export function FactExpressionView({ value }: FactExpressionViewProps) {
  return <BooleanTreeView value={value} ops={conditionTreeOps} renderLeaf={(leaf) => <FactLeafView value={leaf} />} />;
}
