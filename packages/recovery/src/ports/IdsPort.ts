// Gli identificatori nuovi sono I/O: dipendono da un contatore, da un orologio o da un
// generatore di casualità, e il dominio non può produrne (NO-1). Una porta minuscola, ma è ciò
// che tiene `open` una funzione pura e gli scenari riproducibili.

import type { IO } from "fp-ts/IO";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type { RecoverySessionId } from "../domain/RecoverySessionId";

export interface IdsPort {
  readonly newSessionId: IO<RecoverySessionId>;
}

export interface IdsEnv {
  readonly ids: IdsPort;
}

export const newSessionId: ReaderTaskEither<IdsEnv, never, RecoverySessionId> = (env) =>
  TE.fromIO(env.ids.newSessionId);
