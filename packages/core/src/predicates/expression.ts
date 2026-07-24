import { and, not, or, type Predicate } from "fp-ts/Predicate";
import { match } from "ts-pattern";
import type { PredicateValue } from "./model";

// -------------------------------------------------------------------------------------
// Model - espressione booleana su predicati applicativi nominati (es. quelli emessi dai
// tracker in ./tracker.ts, "suitest_camera_connected", ...), combinabili con and/or/not
// da fp-ts/Predicate - a differenza di Pipeline questo livello è puro/sincrono: valuta
// solo lo snapshot corrente dei predicati, non esegue I/O.
// -------------------------------------------------------------------------------------

// Legge il valore corrente di un predicato per nome (`undefined` se non ancora noto)
export type PredicateLookup = (name: string) => PredicateValue | undefined;

export type PredicateExpression =
  | { readonly type: "ref"; readonly name: string }
  | { readonly type: "equals"; readonly name: string; readonly value: PredicateValue }
  | { readonly type: "includes"; readonly name: string; readonly value: string }
  | { readonly type: "and"; readonly exprs: readonly PredicateExpression[] }
  | { readonly type: "or"; readonly exprs: readonly PredicateExpression[] }
  | { readonly type: "not"; readonly expr: PredicateExpression };

// -------------------------------------------------------------------------------------
// Compilazione - da PredicateExpression a Predicate<PredicateLookup>, "vero" = strada buona
// -------------------------------------------------------------------------------------

const foldAnd = (predicates: readonly Predicate<PredicateLookup>[]): Predicate<PredicateLookup> =>
  predicates.reduce((acc, p) => and(p)(acc));

const foldOr = (predicates: readonly Predicate<PredicateLookup>[]): Predicate<PredicateLookup> =>
  predicates.reduce((acc, p) => or(p)(acc));

export const compile = (expr: PredicateExpression): Predicate<PredicateLookup> =>
  match(expr)
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
    .with({ type: "and" }, ({ exprs }) => foldAnd(exprs.map(compile)))
    .with({ type: "or" }, ({ exprs }) => foldOr(exprs.map(compile)))
    .with({ type: "not" }, ({ expr: inner }) => not(compile(inner)))
    .exhaustive();
