import * as IntervalLoop from "@supervisor/core/interval-loop";
import * as Logger from "@supervisor/core/logger";
import * as Retry from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule";
import * as Machine from "@supervisor/core/state-machine/machine";
import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import type * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";

// =========================================================================================
// MACHINE: Activation
// =========================================================================================
//
// STATES     Init   Active   Inactive
//
// EVENTS     ScheduleEvaluated{isActive}
//
// COMMANDS   EnterActive   EnterInactive
//
// -----------------------------------------------------------------------------------------
//     [*] --> Init
//
//     Init     --> Active   : ScheduleEvaluated{isActive: true}  / EnterActive
//     Init     --> Inactive : ScheduleEvaluated{isActive: false} / EnterInactive
//     Inactive --> Active   : ScheduleEvaluated{isActive: true}  / EnterActive
//     Active   --> Inactive : ScheduleEvaluated{isActive: false} / EnterInactive
//     Active   --> Active   : ScheduleEvaluated{isActive: true}    (self-loop, nessun comando)
//     Inactive --> Inactive : ScheduleEvaluated{isActive: false}   (self-loop, nessun comando)
// -----------------------------------------------------------------------------------------
// TRANSITIONS  <FROM> -> <EVENT> -> <TO> [/ <COMMAND>]     (definite in reduce, sotto)
//
//   Init     -> ScheduleEvaluated{true}  -> Active   / EnterActive
//   Init     -> ScheduleEvaluated{false} -> Inactive / EnterInactive
//   Inactive -> ScheduleEvaluated{true}  -> Active   / EnterActive
//   Active   -> ScheduleEvaluated{false} -> Inactive / EnterInactive
//
// =========================================================================================

// -------------------------------------------------------------------------------------
// Model - Activation Machine
// -------------------------------------------------------------------------------------
//
// Traduce uno Schedule (orario di lavoro) in un ciclo di vita a 3 fasi: Init (non ancora
// valutato) -> Active/Inactive, con transizioni Active <-> Inactive successive. A differenza
// del vecchio activation/runner.ts (che richiamava onActive/onInactive ad OGNI tick in cui lo
// schedule risultava attivo/inattivo), qui la callback scatta solo sul cambio di fase - un
// tick che conferma la fase corrente è un self-loop senza comandi (stessa convenzione di
// adb-connection/reduce.ts: una coppia stato/evento fuori sequenza, o qui "senza novità", non
// deve avere effetto).

export type ActivationState = { readonly _tag: "Init" } | { readonly _tag: "Active" } | { readonly _tag: "Inactive" };

export const init: ActivationState = { _tag: "Init" };
export const active: ActivationState = { _tag: "Active" };
export const inactive: ActivationState = { _tag: "Inactive" };

export type ActivationEvent = { readonly _tag: "ScheduleEvaluated"; readonly isActive: boolean };

export type ActivationIntent = { readonly _tag: "EnterActive" } | { readonly _tag: "EnterInactive" };

// -------------------------------------------------------------------------------------
// Reducer
// -------------------------------------------------------------------------------------

export const reduce: Machine.Reducer<ActivationState, ActivationEvent, ActivationIntent> = (state, event) =>
  match<[ActivationState, ActivationEvent], Machine.Transition<ActivationState, ActivationIntent>>([state, event])
    .with([{ _tag: "Init" }, { _tag: "ScheduleEvaluated", isActive: true }], () =>
      Machine.transition(active, [{ _tag: "EnterActive" }]),
    )
    .with([{ _tag: "Init" }, { _tag: "ScheduleEvaluated", isActive: false }], () =>
      Machine.transition(inactive, [{ _tag: "EnterInactive" }]),
    )
    .with([{ _tag: "Inactive" }, { _tag: "ScheduleEvaluated", isActive: true }], () =>
      Machine.transition(active, [{ _tag: "EnterActive" }]),
    )
    .with([{ _tag: "Active" }, { _tag: "ScheduleEvaluated", isActive: false }], () =>
      Machine.transition(inactive, [{ _tag: "EnterInactive" }]),
    )
    .otherwise(() => Machine.transition(state));

// -------------------------------------------------------------------------------------
// Tracing - visibilità automatica sulle transizioni di fase (debugging)
// -------------------------------------------------------------------------------------

const describeState = (state: ActivationState): string => state._tag;

const onTransition: Machine.TransitionHook<ActivationMachineEnv, never, ActivationState, ActivationEvent> =
  (from, _event, to) => (env) =>
    from._tag === to._tag
      ? TE.right(undefined)
      : TE.fromIO(env.logger.child("Activation").info(`Transition = [${describeState(from)} -> ${describeState(to)}]`));

// -------------------------------------------------------------------------------------
// Interpret
// -------------------------------------------------------------------------------------
// I comandi non hanno follow-up event (una volta entrati in fase, si resta lì finché il
// prossimo tick non rileva un cambio) - onActive/onInactive sono Task, non TaskEither: un
// eventuale errore va già gestito dal chiamante (vedi service.ts: TE.getOrElse(...) prima di
// passarli qui), altrimenti resterebbe silenzioso.

export interface ActivationMachineEnv {
  readonly logger: Logger.Tagged;
  readonly onActive: T.Task<void>;
  readonly onInactive: T.Task<void>;
}

export const interpret =
  (intent: ActivationIntent): RTE.ReaderTaskEither<ActivationMachineEnv, never, readonly ActivationEvent[]> =>
  (env) =>
    pipe(
      TE.fromTask(
        match(intent)
          .with({ _tag: "EnterActive" }, () => env.onActive)
          .with({ _tag: "EnterInactive" }, () => env.onInactive)
          .exhaustive(),
      ),
      TE.map((): readonly ActivationEvent[] => []),
    );

// -------------------------------------------------------------------------------------
// Machine
// -------------------------------------------------------------------------------------

const machine: Machine.Machine<ActivationMachineEnv, never, ActivationState, ActivationEvent, ActivationIntent> =
  Machine.make(reduce, interpret, onTransition);

const dispatch = Machine.dispatch(machine);

// -------------------------------------------------------------------------------------
// API
// -------------------------------------------------------------------------------------
// Guida il tick con IntervalLoop (stesso motore riusato da tracking/*, config.tracking.*):
// niente più policy configurabile da config (rimossa), fissa a Retry.constantDelay(1000) su
// indicazione esplicita - la cadenza di valutazione dello schedule non necessita di backoff.

export type StartError = IntervalLoop.StartError;

export const create = (
  logger: Logger.Tagged,
  schedule: Schedule.Schedule,
  callbacks: { readonly onActive: T.Task<void>; readonly onInactive: T.Task<void> },
): IntervalLoop.Handle => {
  const env: ActivationMachineEnv = { logger, ...callbacks };

  let state: ActivationState = init;

  const tick = async (): Promise<void> => {
    const isActive = schedule(Schedule.toTimeSlot(new Date()));
    const result = await dispatch(state, { _tag: "ScheduleEvaluated", isActive })(env)();
    if (result._tag === "Right") state = result.right;
  };

  // Muto: un job infinito a cadenza 1s non deve spammare il log di IntervalLoop ad ogni tick -
  // le transizioni di fase restano comunque visibili (onTransition usa `logger`, non muted).
  const loop = IntervalLoop.create(Logger.muted(logger), Retry.constantDelay(1000), tick, "Activation");

  return { start: loop.start, stop: loop.stop };
};
