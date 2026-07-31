import type { BooleanTree } from "@supervisor/core/boolean-tree/tree";
import { match } from "ts-pattern";
import type { BooleanTreeOps } from "./types";

// Ops per un BooleanTree del core: la struttura and/or/not è la stessa per ogni linguaggio
// (predicate expression, condition), cambia solo il tipo di foglia - quindi una factory sola.
export const booleanTreeOps = <Leaf>(): BooleanTreeOps<BooleanTree<Leaf>, Leaf> => ({
  and: (children) => ({ type: "and", nodes: children }),
  or: (children) => ({ type: "or", nodes: children }),
  not: (child) => ({ type: "not", node: child }),
  leaf: (leaf) => ({ type: "leaf", leaf }),
  match: (node, cases) =>
    match(node)
      .with({ type: "and" }, (n) => cases.and(n.nodes))
      .with({ type: "or" }, (n) => cases.or(n.nodes))
      .with({ type: "not" }, (n) => cases.not(n.node))
      .with({ type: "leaf" }, (n) => cases.leaf(n.leaf))
      .exhaustive(),
});
