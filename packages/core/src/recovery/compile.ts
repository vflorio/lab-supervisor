import * as E from "fp-ts/Either";
import type * as P from "fp-ts/Predicate";
import { durationToMs } from "../date-time";
import { compileCondition, type FactLookup } from "../fact/condition";
import { decode as decodeRetryPolicy, type PolicyDecodeError } from "../retry/codec";
import type { Policy } from "../retry/retry";
import type { Pipeline } from "../workflow/pipeline";
import type { RecoveryTripwire } from "./model";

// Prepara un RecoveryTripwire per l'esecuzione: decodifica la retry policy (può fallire, quindi
// va fatto una volta sola in anticipo) e compila predicate/grace. Indipendente dall'entità -
// riutilizzabile per ogni device visto nel dominio della policy.

export interface CompiledTripwire {
  readonly graceMs: number;
  readonly predicate: P.Predicate<FactLookup>;
  readonly pipeline: Pipeline;
  readonly retryPolicy: Policy;
}

export const compileTripwires = (
  tripwires: readonly RecoveryTripwire[],
): E.Either<PolicyDecodeError, readonly CompiledTripwire[]> => {
  const compiled: CompiledTripwire[] = [];

  for (const tripwire of tripwires) {
    const retryPolicy = decodeRetryPolicy(tripwire.retry);
    if (E.isLeft(retryPolicy)) return retryPolicy;

    compiled.push({
      graceMs: durationToMs(tripwire.grace),
      predicate: compileCondition(tripwire.predicate),
      pipeline: tripwire.pipeline,
      retryPolicy: retryPolicy.right,
    });
  }

  return E.right(compiled);
};
