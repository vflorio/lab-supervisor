import * as Logger from "@supervisor/core/logger/logger";
import * as Retry from "@supervisor/core/retry/retry";
import * as Schedule from "@supervisor/core/schedule/schedule";
import * as E from "fp-ts/Either";
import type * as T from "fp-ts/Task";
import type * as TE from "fp-ts/TaskEither";
import type * as Errors from "../errors";
import * as TaskRunner from "../task-runner";
import { type ActivationMachineEnv, type ActivationState, dispatch, init } from "./machine";

export type StartError = TaskRunner.StartError;

const DESCRIPTOR: TaskRunner.LoopDescriptor = { id: "activation", label: "Activation", policyLabel: "constant 1s" };

export const create = (
  logger: Logger.Tagged,
  schedule: Schedule.Schedule,
  callbacks: { readonly onActive: T.Task<void>; readonly onInactive: T.Task<void> },
): TaskRunner.Handle => {
  const env: ActivationMachineEnv = { logger, ...callbacks };

  let state: ActivationState = init;

  const onTick: TE.TaskEither<Errors.AppError, string | undefined> = async () => {
    const isActive = schedule(Schedule.toTimeSlot(new Date()));
    const result = await dispatch(state, { _tag: "ScheduleEvaluated", isActive })(env)();
    if (E.isLeft(result)) return result;

    state = result.right;
    return E.right(undefined);
  };

  return TaskRunner.create({
    logger: Logger.muted(logger),
    descriptor: DESCRIPTOR,
    policy: Retry.constantDelay(1000),
    onTick,
  });
};
