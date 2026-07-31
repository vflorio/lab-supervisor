import type { Predicate } from "fp-ts/Predicate";
import { match } from "ts-pattern";
import * as BooleanTree from "../boolean-tree/tree";
import type { PredicateValue } from "./model";

// Pure/sync boolean algebra on named predicates; differs from Pipeline by evaluating snapshot only (no I/O)

// Read current predicate value by name (undefined if not yet observed)
export type PredicateLookup = (name: string) => PredicateValue | undefined;

// Unknown fact is false (not error); snapshot fills at tracker's pace
export type FactLeaf =
  | { readonly type: "ref"; readonly name: string }
  | { readonly type: "equals"; readonly name: string; readonly value: PredicateValue }
  | { readonly type: "includes"; readonly name: string; readonly value: string };

export type PredicateExpression = BooleanTree.BooleanTree<FactLeaf>;

export const compileFactLeaf = (leaf: FactLeaf): Predicate<PredicateLookup> =>
  match(leaf)
    .with(
      { type: "ref" },
      ({ name }): Predicate<PredicateLookup> =>
        (lookup) =>
          lookup(name) === true,
    )
    .with(
      { type: "equals" },
      ({ name, value }): Predicate<PredicateLookup> =>
        (lookup) =>
          lookup(name) === value,
    )
    .with(
      { type: "includes" },
      ({ name, value }): Predicate<PredicateLookup> =>
        (lookup) =>
          String(lookup(name) ?? "").includes(value),
    )
    .exhaustive();

// Compile expression into evaluator
export const compile: (expr: PredicateExpression) => Predicate<PredicateLookup> = BooleanTree.compile(compileFactLeaf);

// Constructors for TypeScript use (config comes via codec); avoid manual leaf wrapping
export const ref = (name: string): PredicateExpression => BooleanTree.leaf({ type: "ref", name });

export const equals = (name: string, value: PredicateValue): PredicateExpression =>
  BooleanTree.leaf({ type: "equals", name, value });

export const includes = (name: string, value: string): PredicateExpression =>
  BooleanTree.leaf({ type: "includes", name, value });
