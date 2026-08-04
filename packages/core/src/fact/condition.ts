import type * as P from "fp-ts/Predicate";
import { match } from "ts-pattern";
import * as BooleanTree from "../boolean-tree/tree";
import type { FactValue } from "./model";

// Pure/sync boolean algebra on named facts; differs from Pipeline by evaluating snapshot only (no I/O)

// Read current fact value by name (undefined if not yet observed)
export type FactLookup = (name: string) => FactValue | undefined;

// Unknown fact is false (not error); snapshot fills at tracker's pace
export type FactLeaf =
  | { readonly type: "truthy"; readonly name: string }
  | { readonly type: "equals"; readonly name: string; readonly value: FactValue }
  | { readonly type: "includes"; readonly name: string; readonly value: string };

export type Condition = BooleanTree.BooleanTree<FactLeaf>;

export const compileFactLeaf = (leaf: FactLeaf): P.Predicate<FactLookup> =>
  match(leaf)
    .with(
      { type: "truthy" },
      ({ name }): P.Predicate<FactLookup> =>
        (lookup) =>
          lookup(name) === true,
    )
    .with(
      { type: "equals" },
      ({ name, value }): P.Predicate<FactLookup> =>
        (lookup) =>
          lookup(name) === value,
    )
    .with(
      { type: "includes" },
      ({ name, value }): P.Predicate<FactLookup> =>
        (lookup) =>
          String(lookup(name) ?? "").includes(value),
    )
    .exhaustive();

// Compile condition into evaluator
export const compileCondition: (condition: Condition) => P.Predicate<FactLookup> = BooleanTree.compile(compileFactLeaf);

// Constructors for TypeScript use (config comes via codec); avoid manual leaf wrapping
export const truthy = (name: string): Condition => BooleanTree.leaf({ type: "truthy", name });

export const equals = (name: string, value: FactValue): Condition => BooleanTree.leaf({ type: "equals", name, value });

export const includes = (name: string, value: string): Condition => BooleanTree.leaf({ type: "includes", name, value });
