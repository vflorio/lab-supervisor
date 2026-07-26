import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";
import type { AppError } from "../errors";
import type { PredicateLookup } from "../predicates/expression";
import * as Machine from "../state-machine/machine";

// -------------------------------------------------------------------------------------
// Macchina a stati di un singolo RecoveryTripwire
//
// il tripwire osserva solo il proprio predicate: se resta falso ininterrottamente per >=
// grace, la pipeline scatta (`recovering`). L'esito del tentativo (successo, retry esauriti,
// o un vero errore della pipeline) è un evento di follow-up (`recoveryOutcome`) ridispatchato
// sullo stesso reducer (vedi state-machine/machine.ts#dispatch) - così ogni cambio di stato,
// incluso l'esito, passa dallo stesso canale (`onTransition`, vedi make()) invece di un
// side-channel separato che può arrivare fuori ordine rispetto alle transizioni pure.
// `exhausted`/`fatalError` sono entrambi terminali finché il predicate non torna vero da solo
// o non arriva un reset esplicito (vedi entity-runner.ts#reset) - intervento manuale.
// -------------------------------------------------------------------------------------

export type TripwireState =
  | { readonly tag: "healthy" }
  | { readonly tag: "pending"; readonly since: number }
  | { readonly tag: "recovering" }
  | { readonly tag: "exhausted" }
  | { readonly tag: "fatalError"; readonly error: AppError };

export const initial: TripwireState = { tag: "healthy" };

export interface Observe {
  readonly tag: "observe";
  readonly healthy: boolean;
  readonly now: number;
  readonly lookup: PredicateLookup;
}

// Esito di un tentativo di recovery, ridispatchato come evento (mai un side-channel): un
// `Left` vero della pipeline (errore di configurazione/bug, non un tentativo fallito - vedi
// retry/interpret.ts#retryingUntil) diventa `fatalError` invece di essere silenziosamente
// inghiottito.
export type RecoveryOutcome =
  | { readonly tag: "recoveryOutcome"; readonly outcome: "succeeded" }
  | { readonly tag: "recoveryOutcome"; readonly outcome: "exhausted" }
  | { readonly tag: "recoveryOutcome"; readonly outcome: "fatalError"; readonly error: AppError };

export type Event = Observe | RecoveryOutcome;

export interface RunRecovery {
  readonly tag: "runRecovery";
  readonly lookup: PredicateLookup;
}

export const reduce =
  (graceMs: number): Machine.Reducer<TripwireState, Event, RunRecovery> =>
  (state, event) =>
    match<[TripwireState, Event], Machine.Transition<TripwireState, RunRecovery>>([state, event])
      // Esito di un tentativo - solo da `recovering` (unico stato da cui parte `runRecovery`);
      // l'arm jolly sotto copre un `recoveryOutcome` da un altro stato (non dovrebbe accadere,
      // ma tiene il match totale senza indebolire i tre casi sopra).
      .with([{ tag: "recovering" }, { tag: "recoveryOutcome", outcome: "succeeded" }], () =>
        Machine.transition(initial),
      )
      .with([{ tag: "recovering" }, { tag: "recoveryOutcome", outcome: "exhausted" }], () =>
        Machine.transition({ tag: "exhausted" }),
      )
      .with([{ tag: "recovering" }, { tag: "recoveryOutcome", outcome: "fatalError", error: P.select() }], (error) =>
        Machine.transition({ tag: "fatalError", error }),
      )
      .with([P._, { tag: "recoveryOutcome" }], ([current]) => Machine.transition(current))
      // Un'osservazione sana riporta sempre a healthy, da qualunque stato (self-healing)
      .with([P._, { tag: "observe", healthy: true }], () => Machine.transition(initial))
      .with([{ tag: "healthy" }, { tag: "observe", healthy: false, now: P.select() }], (now) =>
        Machine.transition({ tag: "pending", since: now }),
      )
      .with(
        [
          { tag: "pending", since: P.select("since") },
          { tag: "observe", healthy: false, now: P.select("now"), lookup: P.select("lookup") },
        ],
        ({ since, now, lookup }) =>
          now - since >= graceMs
            ? Machine.transition({ tag: "recovering" }, [{ tag: "runRecovery", lookup }])
            : Machine.transition({ tag: "pending", since }),
      )
      .with([{ tag: "recovering" }, { tag: "observe", healthy: false }], () =>
        Machine.transition({ tag: "recovering" }),
      )
      .with([{ tag: "exhausted" }, { tag: "observe", healthy: false }], () => Machine.transition({ tag: "exhausted" }))
      .with(
        [
          { tag: "fatalError", error: P.select() },
          { tag: "observe", healthy: false },
        ],
        (error) => Machine.transition({ tag: "fatalError", error }),
      )
      .exhaustive();

// Esegue la pipeline (già composta con retry dal chiamante) e converte l'esito - successo,
// retry esauriti, o un vero errore - in un evento `recoveryOutcome`, mai in un Left del
// CommandHandler stesso (Err = never): così ogni caso, incluso l'errore, ridiventa una
// transizione osservabile invece di propagare fuori dal motore e andare perso (vedi il
// vecchio comportamento pre-refactor, dove un Left veniva solo loggato da entity-runner.ts).
// `runRecovery` è funzione del lookup corrente (passato attraverso comando/evento) perché il
// predicate va rivalutato ad ogni tentativo, non catturato una volta sola.
export const makeHandler =
  <Err extends AppError>(
    runRecovery: (lookup: PredicateLookup) => TE.TaskEither<Err, boolean>,
  ): Machine.CommandHandler<unknown, never, Event, RunRecovery> =>
  (command) =>
    RTE.fromTask(
      pipe(
        runRecovery(command.lookup),
        TE.match(
          (error): readonly Event[] => [{ tag: "recoveryOutcome", outcome: "fatalError", error }],
          (succeeded): readonly Event[] => [{ tag: "recoveryOutcome", outcome: succeeded ? "succeeded" : "exhausted" }],
        ),
      ),
    );

export const make = <Err extends AppError>(
  graceMs: number,
  runRecovery: (lookup: PredicateLookup) => TE.TaskEither<Err, boolean>,
  onTransition?: Machine.TransitionHook<unknown, never, TripwireState, Event>,
): Machine.Machine<unknown, never, TripwireState, Event, RunRecovery> =>
  Machine.make(reduce(graceMs), makeHandler(runRecovery), onTransition);
