import type * as Machine from "@supervisor/core/state-machine/machine";
import * as TE from "fp-ts/TaskEither";
import type * as Logger from "../../logger/logger";
import { describeState, type LoopEvent, type LoopState } from "../model";

// Logga solo quando cambia la "fase" (`_tag`), livello error per Failing/Exhausted - stessa
// convenzione di android-bridge/hooks/tracing.ts. `Env = unknown`: il logger è già catturato
// in closure (vedi ./runner.ts), non serve un Reader per un side-effect sempre sincrono.
export const logStateChange =
  (logger: Logger.Tagged): Machine.TransitionHook<unknown, never, LoopState, LoopEvent> =>
  (from, _event, to) =>
  () => {
    if (from._tag === to._tag) return TE.right(undefined);

    const log = to._tag === "Failing" || to._tag === "Exhausted" ? logger.error : logger.info;
    log(`${describeState(from)} -> ${describeState(to)}`)();

    return TE.right(undefined);
  };
