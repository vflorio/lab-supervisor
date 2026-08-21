// Porta del tempo (A-5). Il dominio non ne ha bisogno: riceve `now` dentro i comandi. Serve
// all'application layer, unico posto in cui "adesso" si legge una volta sola e poi si passa
// per valore.
// Da non confondere con il *ticker*, che è un adapter driving e vive fuori da qui (M-9):
// tenere separati chi batte il tempo e chi lo legge è ciò che fa scorrere sei ore simulate
// in millisecondi dentro un test.

import type { IO } from "fp-ts/IO";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type { Instant } from "./Instant";

export interface Clock {
  readonly now: IO<Instant>;
}

export interface ClockEnv {
  readonly clock: Clock;
}

export const now: ReaderTaskEither<ClockEnv, never, Instant> = (env) => TE.fromIO(env.clock.now);
