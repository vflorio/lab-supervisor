import { match } from "ts-pattern";
import { iterationOf, type LoopEvent, type LoopState, lastTickAtOf } from "./model";

// Pura: nessun clock, nessun I/O - il runner (vedi ./runner.ts) è l'unico a sapere "adesso" e a
// eseguire onTick, qui si decide solo "che stato segue".
export const reduce = (state: LoopState, event: LoopEvent): LoopState =>
  match<[LoopState, LoopEvent], LoopState>([state, event])
    .with([{}, { _tag: "TickStarted" }], ([s]) => ({
      _tag: "Ticking",
      iteration: iterationOf(s),
      lastTickAt: lastTickAtOf(s),
    }))
    .with([{ _tag: "Ticking" }, { _tag: "TickSucceeded" }], ([s, e]) =>
      e.delayMs === null
        ? { _tag: "Exhausted", iteration: s.iteration, lastTickAt: e.at }
        : {
            _tag: "Waiting",
            iteration: s.iteration + 1,
            lastTickAt: e.at,
            nextTickAt: e.at + e.delayMs,
            delayMs: e.delayMs,
            detail: e.detail,
          },
    )
    .with([{ _tag: "Ticking" }, { _tag: "TickFailed" }], ([s, e]) =>
      e.delayMs === null
        ? { _tag: "Exhausted", iteration: s.iteration, lastTickAt: e.at }
        : {
            _tag: "Failing",
            iteration: s.iteration + 1,
            lastTickAt: e.at,
            nextTickAt: e.at + e.delayMs,
            delayMs: e.delayMs,
            error: e.error,
          },
    )
    .with([{}, { _tag: "StopRequested" }], ([s]) => ({
      _tag: "Stopped",
      iteration: iterationOf(s),
      lastTickAt: lastTickAtOf(s),
    }))
    // Ogni altra coppia (stato, evento) è un no-op: es. un esito di tick che arriva dopo uno
    // StopRequested (race fisiologica con l'abort) non deve far "rivivere" il loop.
    .otherwise(() => state);
