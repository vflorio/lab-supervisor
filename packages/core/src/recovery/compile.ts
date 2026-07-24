import * as E from "fp-ts/Either";
import type { Predicate } from "fp-ts/Predicate";
import { durationToMs } from "../date-time";
import { compile as compilePredicate, type PredicateLookup } from "../predicates/expression";
import { decode as decodeRetryPolicy, type PolicyDecodeError } from "../retry/codec";
import type { Policy } from "../retry/retry";
import type { Pipeline } from "../workflow/pipeline";
import type { RecoveryLevel } from "./model";

// -------------------------------------------------------------------------------------
// Prepara un RecoveryLevel per l'esecuzione: decodifica la retry policy (può fallire, quindi
// va fatto una volta sola in anticipo, non per ogni entità) e compila predicate/grace.
// Indipendente dall'entità - riutilizzabile per ogni device visto nel dominio della policy.
// -------------------------------------------------------------------------------------

export interface CompiledLevel {
  readonly graceMs: number;
  readonly predicate: Predicate<PredicateLookup>;
  readonly pipeline: Pipeline;
  readonly retryPolicy: Policy;
}

export const compileLevels = (
  levels: readonly RecoveryLevel[],
): E.Either<PolicyDecodeError, readonly CompiledLevel[]> => {
  const compiled: CompiledLevel[] = [];

  for (const level of levels) {
    const retryPolicy = decodeRetryPolicy(level.retry);
    if (E.isLeft(retryPolicy)) return retryPolicy;

    compiled.push({
      graceMs: durationToMs(level.grace),
      predicate: compilePredicate(level.predicate),
      pipeline: level.pipeline,
      retryPolicy: retryPolicy.right,
    });
  }

  return E.right(compiled);
};
