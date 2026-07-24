import * as Machine from "@supervisor/core/state-machine/machine";
import type { AdbConnectionEnv } from "./interpret";
import { interpret } from "./interpret";
import type * as Model from "./model";
import { reduce } from "./reduce";
import { onTransition } from "./tracing";

export const machine: Machine.Machine<
  AdbConnectionEnv,
  never,
  Model.TargetState,
  Model.ConnectionEvent,
  Model.ConnectionIntent
> = Machine.make(reduce, interpret, onTransition);

export const dispatch = Machine.dispatch(machine);
