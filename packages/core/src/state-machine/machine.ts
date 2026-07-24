import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";

// -------------------------------------------------------------------------------------
// Model - state machine: reducer + comandi dichiarativi
// -------------------------------------------------------------------------------------

// Non è specifico ad alcun dominio: S (stato), E (evento) e C (comando) sono ADT
// (discriminated union tag).
// Il reducer decide SOLO "cosa succede", mai "come farlo succedere":
// produce un nuovo stato più una lista di comandi, cioè descrizioni di effetti da eseguire.
// L'esecuzione effettiva (I/O) è delegata al CommandHandler isolato,
// che a sua volta può reimmettere nuovi eventi (feedback loop) interpretati da `dispatch`.

// Esito di una transizione pura: nuovo stato + comandi da eseguire
export interface Transition<S, C> {
  readonly state: S;
  readonly commands: readonly C[];
}

export const transition = <S, C>(state: S, commands: readonly C[] = []): Transition<S, C> => ({ state, commands });

// Reducer: tutta la logica di flusso vive qui, senza I/O
export type Reducer<S, E, C> = (state: S, event: E) => Transition<S, C>;

// Esegue un comando (effetto isolato) e produce gli eventi di follow-up risultanti (se presenti)
export type CommandHandler<Env, Err, E, C> = (command: C) => RTE.ReaderTaskEither<Env, Err, readonly E[]>;

// Hook di tracing opzionale: invocato dall'orchestratore ad ogni dispatch, prima di eseguire i comandi.
// È il motore ad essere trasparente (il logging è intrinsecamente I/O, quindi non può loggare il reducer):
//  sta al chiamante decidere COSA e QUANDO loggare
// (es. solo sui cambi di `_tag`), dato che solo lui conosce la semantica di S/E.
export type TransitionHook<Env, Err, S, E> = (from: S, event: E, to: S) => RTE.ReaderTaskEither<Env, Err, void>;

export interface Machine<Env, Err, S, E, C> {
  readonly reduce: Reducer<S, E, C>;
  readonly handle: CommandHandler<Env, Err, E, C>;
  readonly onTransition?: TransitionHook<Env, Err, S, E>;
}

export const make = <Env, Err, S, E, C>(
  reduce: Reducer<S, E, C>,
  handle: CommandHandler<Env, Err, E, C>,
  onTransition?: TransitionHook<Env, Err, S, E>,
): Machine<Env, Err, S, E, C> => ({ reduce, handle, onTransition });

// -------------------------------------------------------------------------------------
// Orchestratore / interprete dichiarativo
// -------------------------------------------------------------------------------------
// dispatch applica un evento allo stato corrente tramite il reducer,
// poi esegue in sequenza i comandi generati.
// Ogni comando può produrre nuovi eventi, che vengono ridispatchati ricorsivamente
// sullo stesso riduttore fino al punto fisso (nessun nuovo evento prodotto).
// L'orchestratore stesso non contiene logica di dominio: si limita a
// far girare il ciclo comando -> effetto -> evento -> transizione.

export const dispatch =
  <Environment, Error, State, Event, Command>(machine: Machine<Environment, Error, State, Event, Command>) =>
  (state: State, event: Event): RTE.ReaderTaskEither<Environment, Error, State> => {
    const { state: nextState, commands } = machine.reduce(state, event);

    const traced: RTE.ReaderTaskEither<Environment, Error, State> = machine.onTransition
      ? pipe(
          machine.onTransition(state, event, nextState),
          RTE.map(() => nextState),
        )
      : RTE.right(nextState);

    const runCommand =
      (command: Command) =>
      (currentState: State): RTE.ReaderTaskEither<Environment, Error, State> =>
        pipe(
          machine.handle(command),
          RTE.flatMap((followUpEvents) =>
            followUpEvents.reduce<RTE.ReaderTaskEither<Environment, Error, State>>(
              (acc, followUp) =>
                pipe(
                  acc,
                  RTE.flatMap((s) => dispatch(machine)(s, followUp)),
                ),
              RTE.right(currentState),
            ),
          ),
        );

    return commands.reduce<RTE.ReaderTaskEither<Environment, Error, State>>(
      (acc, command) => pipe(acc, RTE.flatMap(runCommand(command))),
      traced,
    );
  };

// Applica una sequenza di eventi esterni in ordine, facendo avanzare lo stato ad ogni step
export const run =
  <Env, Err, S, E, C>(machine: Machine<Env, Err, S, E, C>) =>
  (initialState: S, events: readonly E[]): RTE.ReaderTaskEither<Env, Err, S> =>
    events.reduce<RTE.ReaderTaskEither<Env, Err, S>>(
      (acc, event) =>
        pipe(
          acc,
          RTE.flatMap((state) => dispatch(machine)(state, event)),
        ),
      RTE.right(initialState),
    );
