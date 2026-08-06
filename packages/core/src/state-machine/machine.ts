import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";

// State machine generica: non è specifico ad alcun dominio, S/E/C (stato/evento/comando)
// sono ADT. Il reducer decide SOLO "cosa succede", mai "come farlo succedere": produce un
// nuovo stato più una lista di comandi (descrizioni di effetti). L'esecuzione (I/O) è
// delegata al CommandHandler isolato, che può reimmettere nuovi eventi interpretati da `dispatch`.

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

export const make = <Env, Error, State, Event, Intent>(
  reduce: Reducer<State, Event, Intent>,
  handle: CommandHandler<Env, Error, Event, Intent>,
  onTransition?: TransitionHook<Env, Error, State, Event>,
): Machine<Env, Error, State, Event, Intent> => ({ reduce, handle, onTransition });

// Compone più TransitionHook indipendenti (es. uno che logga, uno che inoltra a un feed)
// in uno solo, eseguiti in ordine - così un chiamante può estendere l'osservabilità di una
// macchina senza sostituire quella già presente. `undefined` viene filtrato: comporre zero
// hook (o solo `undefined`) produce `undefined`, non un hook no-op.
export const composeTransitionHooks = <Env, Error, State, Event>(
  ...hooks: ReadonlyArray<TransitionHook<Env, Error, State, Event> | undefined>
): TransitionHook<Env, Error, State, Event> | undefined =>
  pipe(
    hooks,
    RA.filterMap(O.fromNullable),
    O.fromPredicate(RA.isNonEmpty),
    O.map(
      (defined): TransitionHook<Env, Error, State, Event> =>
        (from, event, to) =>
          pipe(
            defined.map((hook) => hook(from, event, to)),
            RTE.sequenceArray,
            RTE.asUnit,
          ),
    ),
    O.toUndefined,
  );

// dispatch applica un evento allo stato corrente tramite il reducer, poi esegue in sequenza
// i comandi generati. Ogni comando può produrre nuovi eventi, ridispatchati ricorsivamente
// sullo stesso reducer fino al punto fisso. L'orchestratore non contiene logica di dominio:
// si limita a far girare il ciclo comando -> effetto -> evento -> transizione.

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

// Riferimento allo stato "vivo" di una macchina: `dispatchTo` lo legge e lo scrive invece di
// threadare lo stato dentro il fold.
export interface StateRef<S> {
  readonly get: () => S;
  readonly set: (state: S) => void;
}

// Variante store-based di `dispatch`: stessa logica, ma la transizione viene applicata alla
// StateRef PRIMA di eseguire i comandi, e ogni evento di follow-up riparte dallo stato
// corrente invece che da quello catturato all'avvio del comando. Serve quando un comando è a
// lunga durata (es. una pipeline di recovery con retry, minuti) e nel frattempo possono
// arrivare altri eventi: con `dispatch` lo stato osservabile resterebbe fermo a quello di
// partenza per tutta la durata dell'effetto - un secondo evento lo ridurrebbe da uno stato
// stale, e l'esito tardivo sovrascriverebbe quanto successo nel frattempo. Il reducer resta
// l'unico a decidere: è il solo a vedere lo stato aggiornato, incluso il caso "l'esito non è
// più pertinente".
export const dispatchTo =
  <Environment, Error, State, Event, Command>(machine: Machine<Environment, Error, State, Event, Command>) =>
  (ref: StateRef<State>) =>
  (event: Event): RTE.ReaderTaskEither<Environment, Error, State> => {
    // Un solo IO sincrono: leggi -> riduci -> scrivi, senza await in mezzo, così due dispatch
    // concorrenti non possono partire entrambi dallo stesso stato.
    const applied: RTE.ReaderTaskEither<Environment, Error, Applied<State, Command>> = RTE.fromIO(() => {
      const from = ref.get();
      const { state: to, commands } = machine.reduce(from, event);
      ref.set(to);
      return { from, to, commands };
    });

    const runCommand = (command: Command): RTE.ReaderTaskEither<Environment, Error, State> =>
      pipe(
        machine.handle(command),
        RTE.flatMap((followUpEvents) =>
          followUpEvents.reduce<RTE.ReaderTaskEither<Environment, Error, State>>(
            (acc, followUp) =>
              pipe(
                acc,
                RTE.flatMap(() => dispatchTo(machine)(ref)(followUp)),
              ),
            RTE.fromIO(ref.get),
          ),
        ),
      );

    return pipe(
      applied,
      RTE.flatMap(({ from, to, commands }) =>
        pipe(
          machine.onTransition ? machine.onTransition(from, event, to) : RTE.right<Environment, Error, void>(undefined),
          RTE.flatMap(() =>
            commands.reduce<RTE.ReaderTaskEither<Environment, Error, State>>(
              (acc, command) =>
                pipe(
                  acc,
                  RTE.flatMap(() => runCommand(command)),
                ),
              RTE.fromIO(ref.get),
            ),
          ),
        ),
      ),
    );
  };

interface Applied<S, C> {
  readonly from: S;
  readonly to: S;
  readonly commands: readonly C[];
}

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
