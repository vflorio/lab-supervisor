import type { Condition, ConditionLeaf } from "@supervisor/core/workflow/condition";
import { booleanTreeOps } from "../boolean-tree/ops";
import type { BooleanTreeOps } from "../boolean-tree/types";

// Stessa struttura di predicateTreeOps, foglie in più (i probe): vedi
// @supervisor/core/workflow/condition
export const conditionTreeOps: BooleanTreeOps<Condition, ConditionLeaf> = booleanTreeOps<ConditionLeaf>();
