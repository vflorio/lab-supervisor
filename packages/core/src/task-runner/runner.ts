import * as Machine from "@supervisor/core/state-machine/machine";
import * as E from "fp-ts/Either";
import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as Errors from "../errors";
import * as Logger from "../logger/logger";
import type * as Retry from "../retry/retry";
import { forwardToLoopFeed } from "./hooks/loop-feed";
import { logStateChange } from "./hooks/tracing";
import { initial, type LoopDescriptor, type LoopEvent, type LoopState } from "./model";
import { reduce } from "./reduce";
import type { LoopStream } from "./stream";

// Motore minimale per un ciclo `onTick` a cadenza guidata da una Retry.Policy, senza alcuna
// nozione di schedule/orario di lavoro: un tracker di monitoring deve poter girare in continuo.
// Lo stato FSM (LoopState) è puramente osservabile - non guida mai il control-flow, che resta
// interamente qui: `reduce` è chiamato dopo ogni fatto già avvenuto, mai prima.

export interface StartError extends Errors.AppError<"StartError"> {}

export interface Handle {
  readonly start: TE.TaskEither<StartError, void>;
  readonly stop: IO.IO<void>;
}

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly descriptor: LoopDescriptor;
  readonly policy: Retry.Policy;
  // Un tick che fallisce non ferma il loop (lo decide solo la policy, come prima) - l'esito
  // diventa però osservabile: Left -> stato "error", Right(string) -> `detail` ("last outcome line").
  readonly onTick: TE.TaskEither<Errors.AppError, string | undefined>;
  // Assente per i loop puramente interni (es. activation): esistono e vengono loggati, ma non
  // alimentano nessuna dashboard.
  readonly loopStream?: LoopStream;
}

export const create = ({ logger, descriptor, policy, onTick, loopStream }: Deps): Handle => {
  const controller = new AbortController();
  const runnerLogger = logger.child("TaskRunner").child(descriptor.id);

  let state: LoopState = initial;

  const onTransition = Machine.composeTransitionHooks<unknown, never, LoopState, LoopEvent>(
    logStateChange(runnerLogger),
    loopStream && forwardToLoopFeed(loopStream, descriptor),
  );

  const applyEvent = (event: LoopEvent): void => {
    const next = reduce(state, event);
    if (onTransition) void onTransition(state, event, next)(undefined)();
    state = next;
  };

  // Bookkeeping per la policy, distinto dal LoopState osservabile: la forma che `Retry.Policy`
  // si aspetta (`{iteration, previousDelay}`) non coincide con quella dei singoli stati FSM
  // (es. Idle/Exhausted non portano un `previousDelay` significativo).
  let retryStatus: Retry.Status = { iteration: 0, previousDelay: null };

  // Un onTick che *rigetta* (un throw non catturato, non un Left) è un tick fallito come gli
  // altri, non la fine del loop: lasciato risalire, uscirebbe da runLoop, verrebbe assorbito
  // dal TE.tryCatch di `start` e scartato da `detach` - loop morto in silenzio, per giunta
  // senza evento StopRequested, quindi con la dashboard che continua a mostrarlo in esecuzione.
  const runTick = (): Promise<E.Either<Errors.AppError, string | undefined>> =>
    onTick().catch((error: unknown) => E.left(Errors.fromUnknown("TickError")(error)));

  const runLoop = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      applyEvent({ _tag: "TickStarted", at: Date.now() });

      const result = await runTick();
      const delayMs = policy(retryStatus);
      const at = Date.now();

      if (E.isRight(result)) {
        applyEvent({ _tag: "TickSucceeded", at, detail: result.right || undefined, delayMs });
      } else {
        runnerLogger.error(`tick failed: ${Errors.format(result.left)}`)();
        applyEvent({ _tag: "TickFailed", at, error: result.left, delayMs });
      }

      if (delayMs === null) {
        runnerLogger.info(`${descriptor.label} exhausted - stopping`)();
        return;
      }

      retryStatus = { iteration: retryStatus.iteration + 1, previousDelay: delayMs };

      runnerLogger.debug(
        `${descriptor.label} - Tick: ${retryStatus.iteration} - Next delay: ${Logger.formatMs(delayMs)}`,
      )();

      await sleep(delayMs, controller.signal);
    }
  };

  return {
    start: pipe(
      TE.fromIO(runnerLogger.info(`Starting ${descriptor.label}`)),
      TE.flatMap(() => TE.tryCatch(() => runLoop(), Errors.fromUnknown("StartError"))),
    ),
    stop: pipe(
      runnerLogger.info(`Stopping ${descriptor.label}`),
      IO.flatMap(() => () => {
        applyEvent({ _tag: "StopRequested", at: Date.now() });
        controller.abort();
      }),
    ),
  };
};

// Abortabile: si risolve subito su abort invece di aspettare lo scadere di `ms`, altrimenti
// `stop()` resterebbe bloccato fino al prossimo tick (fino a minuti, con backoff esponenziale).
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

// Detach: esegue un TaskEither in background, senza attendere il risultato
export const detach =
  <A>(task: TE.TaskEither<Errors.AppError<any>, A>): IO.IO<void> =>
  () => {
    void task();
  };
