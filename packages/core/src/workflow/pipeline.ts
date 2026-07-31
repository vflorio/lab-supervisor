import type { Condition } from "./condition";

// Composes workflows via and/or/not (fp-ts/Predicate style, but effectful with I/O & retry)
// - or: try first, escalate if fails
// - and: all must succeed in sequence
// - not: invert result
// Returns true/false for outcome, Left for config errors (not failed attempts)
// Note: success ≠ healing; or-branches need awaitPredicate to distinguish command success from device recovery

export type Pipeline =
  | { readonly type: "workflow"; readonly workflowName: string }
  // Precondition: gate check (e.g., "don't reboot while recording"); used with and in policy guards
  | { readonly type: "condition"; readonly condition: Condition }
  | { readonly type: "and"; readonly pipelines: readonly Pipeline[] }
  | { readonly type: "or"; readonly pipelines: readonly Pipeline[] }
  | { readonly type: "not"; readonly pipeline: Pipeline };
