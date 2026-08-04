import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";
import type { AppError } from "../errors";
import type { FactLookup } from "../fact/condition";
import * as Machine from "../state-machine/machine";

// Macchina a stati di un singolo RecoveryTripwire: osserva solo il proprio predicate, se
// resta falso ininterrottamente per >= grace la pipeline scatta (`recovering`). L'esito del
// tentativo è un evento di follow-up (`recoveryOutcome`) ridispatchato sullo stesso reducer -
// così ogni cambio di stato passa dallo stesso canale (`onTransition`), mai un side-channel
// che può arrivare fuori ordine. `exhausted`/`fatalError` sono terminali finché il predicate
// non torna vero da solo o non arriva un reset esplicito (intervento manuale).
//
// `recovering` significa "un tentativo è in volo", non "il predicate è falso": è l'unico stato
// che descrive un effetto in corso invece di una constatazione, e per questo nessuna
// osservazione lo interrompe - nemmeno una sana. Solo l'esito del tentativo chiude l'episodio.
// Senza questa regola un predicate che flappa durante una pipeline lunga (recovering ->
// healthy -> pending -> grace scaduta -> recovering) lancerebbe un secondo tentativo mentre il
// primo è ancora in esecuzione: due reboot veri sullo stesso device.

export type TripwireState =
  | { readonly tag: "healthy" }
  | { readonly tag: "pending"; readonly since: number }
  // `since` è l'istante di avvio del tentativo e, insieme, la sua identità: l'esito che arriva
  // deve dichiarare a quale tentativo si riferisce (vedi `RecoveryOutcome.attempt`).
  | { readonly tag: "recovering"; readonly since: number }
  | { readonly tag: "exhausted" }
  | { readonly tag: "fatalError"; readonly error: AppError };

export const initial: TripwireState = { tag: "healthy" };

export interface Observe {
  readonly tag: "observe";
  readonly healthy: boolean;
  readonly now: number;
  readonly lookup: FactLookup;
}

// Esito di un tentativo di recovery, ridispatchato come evento (mai un side-channel): un
// `Left` vero della pipeline (errore di configurazione/bug, non un tentativo fallito) diventa
// `fatalError` invece di essere silenziosamente inghiottito. `attempt` è l'identità del
// tentativo che l'ha prodotto (= `recovering.since`): un esito che non corrisponde al tentativo
// in corso è l'eco di un episodio già chiuso - tipicamente da un reset manuale arrivato mentre
// la pipeline era ancora in volo - e va ignorato, non applicato allo stato attuale.
export type RecoveryOutcome =
  | { readonly tag: "recoveryOutcome"; readonly attempt: number; readonly outcome: "succeeded" }
  | { readonly tag: "recoveryOutcome"; readonly attempt: number; readonly outcome: "exhausted" }
  | {
      readonly tag: "recoveryOutcome";
      readonly attempt: number;
      readonly outcome: "fatalError";
      readonly error: AppError;
    };

export type Event = Observe | RecoveryOutcome;

export interface RunRecovery {
  readonly tag: "runRecovery";
  readonly attempt: number;
  readonly lookup: FactLookup;
}

// Traduce l'esito nello stato che ne consegue - separato dal match principale, che ha già il
// suo lavoro: decidere *se* questo esito è ancora pertinente.
const applyOutcome = (outcome: RecoveryOutcome): Machine.Transition<TripwireState, RunRecovery> =>
  match<RecoveryOutcome, Machine.Transition<TripwireState, RunRecovery>>(outcome)
    .with({ outcome: "succeeded" }, () => Machine.transition(initial))
    .with({ outcome: "exhausted" }, () => Machine.transition({ tag: "exhausted" }))
    .with({ outcome: "fatalError", error: P.select() }, (error) => Machine.transition({ tag: "fatalError", error }))
    .exhaustive();

export const reduce =
  (graceMs: number): Machine.Reducer<TripwireState, Event, RunRecovery> =>
  (state, event) =>
    match<[TripwireState, Event], Machine.Transition<TripwireState, RunRecovery>>([state, event])
      // Esito di un tentativo, applicato solo se è quello in corso: `recovering` è l'unico stato
      // da cui parte un `runRecovery`, e l'identità distingue il tentativo attuale da uno
      // precedente il cui esito arriva in ritardo.
      .with([{ tag: "recovering" }, { tag: "recoveryOutcome" }], ([current, outcome]) =>
        current.since === outcome.attempt ? applyOutcome(outcome) : Machine.transition(current),
      )
      .with([P._, { tag: "recoveryOutcome" }], ([current]) => Machine.transition(current))
      // Nessuna osservazione interrompe un tentativo in volo, nemmeno una sana: l'episodio lo
      // chiude il suo esito, e la pipeline rivaluta comunque il predicate ad ogni tentativo -
      // quindi un predicate tornato sano nel frattempo torna come "succeeded", non come un
      // secondo `runRecovery` in parallelo.
      .with([{ tag: "recovering" }, { tag: "observe" }], ([current]) => Machine.transition(current))
      // Un'osservazione sana riporta sempre a healthy, da qualunque altro stato (self-healing)
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
            ? Machine.transition({ tag: "recovering", since: now }, [{ tag: "runRecovery", attempt: now, lookup }])
            : Machine.transition({ tag: "pending", since }),
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

// Esegue la pipeline e converte l'esito - successo, retry esauriti, o un vero errore - in un
// evento `recoveryOutcome`, mai in un Left del CommandHandler stesso (Err = never): così ogni
// caso, incluso l'errore, ridiventa una transizione osservabile invece di propagare fuori dal
// motore e andare perso. `runRecovery` è funzione del lookup corrente perché il predicate va
// rivalutato ad ogni tentativo, non catturato una volta sola.
export const makeHandler =
  <Err extends AppError>(
    runRecovery: (lookup: FactLookup) => TE.TaskEither<Err, boolean>,
  ): Machine.CommandHandler<unknown, never, Event, RunRecovery> =>
  (command) =>
    RTE.fromTask(
      pipe(
        runRecovery(command.lookup),
        TE.match(
          (error): readonly Event[] => [
            { tag: "recoveryOutcome", attempt: command.attempt, outcome: "fatalError", error },
          ],
          (succeeded): readonly Event[] => [
            { tag: "recoveryOutcome", attempt: command.attempt, outcome: succeeded ? "succeeded" : "exhausted" },
          ],
        ),
      ),
    );

export const make = <Err extends AppError>(
  graceMs: number,
  runRecovery: (lookup: FactLookup) => TE.TaskEither<Err, boolean>,
  onTransition?: Machine.TransitionHook<unknown, never, TripwireState, Event>,
): Machine.Machine<unknown, never, TripwireState, Event, RunRecovery> =>
  Machine.make(reduce(graceMs), makeHandler(runRecovery), onTransition);
