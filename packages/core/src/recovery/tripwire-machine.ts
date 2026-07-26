import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";
import type { AppError } from "../errors";
import type { PredicateLookup } from "../predicates/expression";
import * as Machine from "../state-machine/machine";

// -------------------------------------------------------------------------------------
// Macchina a stati di un singolo RecoveryTripwire
//
// il tripwire osserva solo il proprio predicate, se resta falso ininterrottamente per >= grace,
// la pipeline scatta e il tripwire non può ri-scattare finché il predicate non torna vero
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
  readonly lookup: PredicateLookup;
}

export interface RunRecovery {
  readonly tag: "runRecovery";
  readonly lookup: PredicateLookup;
}

export const reduce =
  (graceMs: number): Machine.Reducer<TripwireState, Observe, RunRecovery> =>
  (state, event) =>
    match<[TripwireState, Observe], Machine.Transition<TripwireState, RunRecovery>>([state, event])
      .with([{ tag: P._ }, { healthy: true }], () => Machine.transition(initial))
      .with([{ tag: "healthy" }, { now: P.select() }], (now) => Machine.transition({ tag: "pending", since: now }))
      .with(
        [
          { tag: "pending", since: P.select("since") },
          { now: P.select("now"), lookup: P.select("lookup") },
        ],
        ({ since, now, lookup }) =>
          now - since >= graceMs
            ? Machine.transition({ tag: "fired" }, [{ tag: "runRecovery", lookup }])
            : Machine.transition({ tag: "pending", since }),
      )
      .with([{ tag: "fired" }, { healthy: false }], () => Machine.transition({ tag: "fired" }))
      .exhaustive();

// Esegue la pipeline (già composta con retry dal chiamante) e riporta l'esito; l'esito tiene conto
// sia del risultato della pipeline sia del predicate stesso (vedi entity-runner.ts: la pipeline può
// "riuscire" senza che il predicate torni vero, es. un reboot inviato con successo ma il device non
// ancora tornato raggiungibile) - per questo `runRecovery` è una funzione del lookup corrente
// (passato attraverso l'evento/comando) invece di un TaskEither statico costruito una volta sola.
// Non produce mai eventi di follow-up: il prossimo Observe (dal tick periodico o da un cambio
// predicate) guiderà la transizione successiva
export const makeHandler =
  <Err extends AppError>(
    runRecovery: (lookup: PredicateLookup) => TE.TaskEither<Err, boolean>,
    onResult: (succeeded: boolean) => void,
  ): Machine.CommandHandler<unknown, Err, Observe, RunRecovery> =>
  (command) =>
    pipe(
      RTE.fromTaskEither(runRecovery(command.lookup)),
      RTE.tapIO((succeeded) => () => onResult(succeeded)),
      RTE.map(() => []),
    );

export const make = <Error extends AppError>(
  graceMs: number,
  runRecovery: (lookup: PredicateLookup) => TE.TaskEither<Error, boolean>,
  onResult: (succeeded: boolean) => void,
): Machine.Machine<unknown, Error, TripwireState, Observe, RunRecovery> =>
  Machine.make(reduce(graceMs), makeHandler(runRecovery, onResult));
