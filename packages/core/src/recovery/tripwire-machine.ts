import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";
import type { AppError } from "../errors";
import * as Machine from "../state-machine/machine";

// -------------------------------------------------------------------------------------
// Macchina a stati di un singolo RecoveryTripwire
//
// Semantica "tripwire indipendente" (non escalation sequenziale):
// il livello osserva solo il proprio predicate;
// Se resta falso ininterrottamente per >= grace, la pipeline scatta una volta sola;
// il livello non può ri-scattare finché il predicate non torna vero
// -------------------------------------------------------------------------------------

export type TripwireState =
  | { readonly tag: "healthy" }
  | { readonly tag: "pending"; readonly since: number }
  | { readonly tag: "fired" };

export const initial: TripwireState = { tag: "healthy" };

export interface Observe {
  readonly tag: "observe";
  readonly healthy: boolean;
  readonly now: number;
}

export interface RunRecovery {
  readonly tag: "runRecovery";
}

export const reduce =
  (graceMs: number): Machine.Reducer<TripwireState, Observe, RunRecovery> =>
  (state, event) =>
    match<[TripwireState, Observe], Machine.Transition<TripwireState, RunRecovery>>([state, event])
      .with([{ tag: P._ }, { healthy: true }], () => Machine.transition(initial))
      .with([{ tag: "healthy" }, { now: P.select() }], (now) => Machine.transition({ tag: "pending", since: now }))
      .with([{ tag: "pending", since: P.select("since") }, { now: P.select("now") }], ({ since, now }) =>
        now - since >= graceMs
          ? Machine.transition({ tag: "fired" }, [{ tag: "runRecovery" }])
          : Machine.transition({ tag: "pending", since }),
      )
      .with([{ tag: "fired" }, { healthy: false }], () => Machine.transition({ tag: "fired" }))
      .exhaustive();

// Esegue la pipeline (già composta con retry dal chiamante) e riporta l'esito;
// non produce mai eventi di follow-up: il prossimo Observe (dal tick periodico o da un cambio predicate)
// guiderà la transizione successiva
export const makeHandler =
  <Err extends AppError>(
    runWithRetry: TE.TaskEither<Err, boolean>,
    onResult: (succeeded: boolean) => void,
  ): Machine.CommandHandler<unknown, Err, Observe, RunRecovery> =>
  () =>
    pipe(
      RTE.fromTaskEither(runWithRetry),
      RTE.tapIO((succeeded) => () => onResult(succeeded)),
      RTE.map(() => []),
    );

export const make = <Error extends AppError>(
  graceMs: number,
  runWithRetry: TE.TaskEither<Error, boolean>,
  onResult: (succeeded: boolean) => void,
): Machine.Machine<unknown, Error, TripwireState, Observe, RunRecovery> =>
  Machine.make(reduce(graceMs), makeHandler(runWithRetry, onResult));
