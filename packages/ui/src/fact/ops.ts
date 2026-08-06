import type { Condition, FactLeaf } from "@supervisor/core/fact/condition";
import { booleanTreeOps } from "../boolean-tree/ops";
import type { BooleanTreeOps } from "../boolean-tree/types";

export type { FactLeaf };

export const conditionTreeOps: BooleanTreeOps<Condition, FactLeaf> = booleanTreeOps<FactLeaf>();
