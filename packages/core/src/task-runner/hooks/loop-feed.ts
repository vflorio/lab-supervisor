import type * as Machine from "@supervisor/core/state-machine/machine";
import * as TE from "fp-ts/TaskEither";
import type { LoopDescriptor, LoopEvent, LoopState } from "../model";
import { project } from "../project";
import type { LoopStream } from "../stream";

// Pubblica su OGNI transizione (non solo sui cambi di `_tag`, a differenza di logStateChange):
// uno strumento ad uso rete interna, il costo di qualche messaggio in più al secondo per loop
// è accettabile e lo stesso canale WS porta già i log di servizio.
export const forwardToLoopFeed =
  (stream: LoopStream, descriptor: LoopDescriptor): Machine.TransitionHook<unknown, never, LoopState, LoopEvent> =>
  (_from, _event, to) =>
  () => {
    stream.publish(project(descriptor, to));
    return TE.right(undefined);
  };
