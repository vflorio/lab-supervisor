import * as Logger from "@supervisor/core/logger/logger";
import * as Retry from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule/schedule";
import type * as T from "fp-ts/Task";
import * as TaskRunner from "../task-runner";
import { type ActivationMachineEnv, type ActivationState, dispatch, init } from "./machine";

export type StartError = TaskRunner.StartError;

export const create = (
  logger: Logger.Tagged,
  schedule: Schedule.Schedule,
  callbacks: { readonly onActive: T.Task<void>; readonly onInactive: T.Task<void> },
): TaskRunner.Handle => {
  const env: ActivationMachineEnv = { logger, ...callbacks };

  let state: ActivationState = init;

  const tick = async (): Promise<void> => {
    const isActive = schedule(Schedule.toTimeSlot(new Date()));
    const result = await dispatch(state, { _tag: "ScheduleEvaluated", isActive })(env)();
    if (result._tag === "Right") state = result.right;
  };

  return TaskRunner.create(Logger.muted(logger), Retry.constantDelay(1000), tick);
};
