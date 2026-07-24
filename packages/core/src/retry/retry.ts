import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { Logger } from "../logger";

export * from "./codec";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Status {
  readonly iteration: number;
  readonly previousDelay: number | null;
}

export const initialStatus: Status = {
  iteration: 0,
  previousDelay: null, // Indichiamo c
};

// Una Policy è una funzione che dato uno Status restituisce un delay in millisecondi
// con null indichiamo che la policy ha terminato i tentativi
export type Policy = (status: Status) => number | null;

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

// Delay costante, tentativi infiniti
export const constantDelay =
  (delay: number): Policy =>
  () =>
    delay;

// Riprova subito, ma al massimo n volte
export const limitRetries =
  (retryCount: number): Policy =>
  (status) =>
    status.iteration >= retryCount ? null : 0;

// Delay esponenziale, tentativi infiniti
export const exponentialBackoff =
  (delay: number): Policy =>
  (status) =>
    delay * 2 ** status.iteration;

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

// Imposta un limite massimo di delay per una policy
export const capDelay =
  (maxDelay: number) =>
  (policy: Policy): Policy =>
  (status) => {
    const delay = policy(status);
    return delay === null ? null : Math.min(maxDelay, delay);
  };

// Combina due policy: si continua solo se entrambe dicono di continuare,
// si aspetta il delay più lungo tra le due
export const concat =
  (second: Policy) =>
  (first: Policy): Policy =>
  (status) => {
    const delay1 = first(status);
    const delay2 = second(status);

    if (delay1 !== null && delay2 !== null) {
      return Math.max(delay1, delay2);
    }

    return null;
  };

// -------------------------------------------------------------------------------------
// Interpret
// -------------------------------------------------------------------------------------

export const applyPolicy =
  (policy: Policy) =>
  (status: Status): Status => ({
    iteration: status.iteration + 1,
    previousDelay: policy(status),
  });

const delay = (ms: number): TE.TaskEither<never, void> =>
  TE.fromTask(() => new Promise((resolve) => setTimeout(resolve, ms)));

// Riprova un TaskEither usando una Policy fino a quando la policy non è esaurita o l'azione ha successo
export const retrying =
  (policy: Policy, logger?: Logger) =>
  <E, A>(action: TE.TaskEither<E, A>): TE.TaskEither<E, A> => {
    const apply = applyPolicy(policy);

    const loop = (status: Status): TE.TaskEither<E, A> =>
      TE.orElse<E, A, E>((error) => {
        const next = apply(status);

        const exhausted = next.previousDelay === null;
        if (exhausted) {
          logger?.debug(`Retry policy exhausted after ${status.iteration + 1} attempt(s)`)();
          return TE.left(error);
        }

        logger?.debug(
          `Retry attempt ${next.iteration}/${exhausted ? "∞" : "?"} - next delay: ${next.previousDelay}ms`,
        )();

        return TE.flatMap(() => loop(next))(delay(next.previousDelay!));
      })(action);

    return loop(initialStatus);
  };

// Come `retrying`, ma per azioni che per convenzione ritornano `true`/`false` invece di
// fallire con un `Left` (es. Workflow/Pipeline, vedi workflow/pipeline-interpreter.ts):
// ritenta finché l'esito non è `true` o la policy si esaurisce (nel qual caso ritorna `false`,
// non un errore - un tentativo di recovery esaurito non è un errore applicativo).
// Un vero `Left` (errore di configurazione, non un tentativo fallito) non viene ritentato.
export const retryingUntil =
  (policy: Policy, logger?: Logger) =>
  <E>(action: TE.TaskEither<E, boolean>): TE.TaskEither<E, boolean> => {
    const apply = applyPolicy(policy);

    const loop = (status: Status): TE.TaskEither<E, boolean> =>
      pipe(
        action,
        TE.flatMap((ok) => {
          if (ok) return TE.right(true);

          const next = apply(status);

          const exhausted = next.previousDelay === null;
          if (exhausted) {
            logger?.debug(`Retry policy exhausted after ${status.iteration + 1} attempt(s), giving up`)();
            return TE.right(false);
          }

          logger?.debug(`Retry attempt ${next.iteration} - next delay: ${next.previousDelay}ms`)();

          return TE.flatMap(() => loop(next))(delay(next.previousDelay!));
        }),
      );

    return loop(initialStatus);
  };
