// Le domande che il recupero si pone davvero sulle proprie sessioni (A-8).
// `findBlockingFor` è INV-1 **e** INV-9 in una domanda sola, ed è di proposito: "posso aprire una
// sessione su questi device?" ha due risposte negative — ce n'è già una attiva che li tocca,
// oppure ci si è arresi da poco e il cooldown non è passato — e chiederle separatamente
// significherebbe che qualcuno, prima o poi, ne chiede solo una.
// Nessun aggregato vede i propri fratelli: è qui che INV-1 diventa verificabile.

import type { Instant } from "@lab/kernel/Instant";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type * as O from "fp-ts/Option";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { RecoverySession } from "../domain/RecoverySession";
import type { RecoverySessionId } from "../domain/RecoverySessionId";

export type Blocking =
  | { readonly _tag: "ActiveSession"; readonly session: RecoverySession }
  // Una resa recente: nessuna sessione nuova sugli stessi device finché non è passato il
  // cooldown, o un device rotto verrebbe riavviato e notificato a ogni ciclo (INV-9).
  | { readonly _tag: "CoolingDown"; readonly session: RecoverySession; readonly until: Instant };

export interface RecoverySessionRepository {
  readonly findBlockingFor: (
    devices: ReadonlyArray<DeviceId>,
    now: Instant,
  ) => TE.TaskEither<never, ReadonlyArray<Blocking>>;
  readonly activeInvolving: (devices: ReadonlyArray<DeviceId>) => TE.TaskEither<never, ReadonlyArray<RecoverySession>>;
  readonly dueAt: (now: Instant) => TE.TaskEither<never, ReadonlyArray<RecoverySession>>;
  readonly byId: (id: RecoverySessionId) => TE.TaskEither<never, O.Option<RecoverySession>>;
  readonly save: (session: RecoverySession) => TE.TaskEither<never, void>;
}

export interface RecoverySessionRepositoryEnv {
  readonly recoverySessionRepository: RecoverySessionRepository;
}

type Access<A> = ReaderTaskEither<RecoverySessionRepositoryEnv, never, A>;

export const findBlockingFor =
  (devices: ReadonlyArray<DeviceId>, now: Instant): Access<ReadonlyArray<Blocking>> =>
  (env) =>
    env.recoverySessionRepository.findBlockingFor(devices, now);

export const activeInvolving =
  (devices: ReadonlyArray<DeviceId>): Access<ReadonlyArray<RecoverySession>> =>
  (env) =>
    env.recoverySessionRepository.activeInvolving(devices);

export const dueAt =
  (now: Instant): Access<ReadonlyArray<RecoverySession>> =>
  (env) =>
    env.recoverySessionRepository.dueAt(now);

export const byId =
  (id: RecoverySessionId): Access<O.Option<RecoverySession>> =>
  (env) =>
    env.recoverySessionRepository.byId(id);

export const save =
  (session: RecoverySession): Access<void> =>
  (env) =>
    env.recoverySessionRepository.save(session);
