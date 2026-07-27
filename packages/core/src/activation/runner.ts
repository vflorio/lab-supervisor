import * as IntervalLoop from "@supervisor/core/interval-loop";
import * as Logger from "@supervisor/core/logger/logger";
import * as Retry from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule";
import type * as T from "fp-ts/Task";
import { type ActivationMachineEnv, type ActivationState, dispatch, init } from "./machine";

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

  return IntervalLoop.create(Logger.muted(logger), Retry.constantDelay(1000), tick);
};
