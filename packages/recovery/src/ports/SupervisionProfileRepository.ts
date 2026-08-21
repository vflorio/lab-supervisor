// I profili, per tipo di device. Un kind senza profilo non è un errore di configurazione: è il
// modo in cui si dice che quel tipo è monitorato ma non curato (NF-1).

import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import type * as O from "fp-ts/Option";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { SupervisionProfile } from "../domain/SupervisionProfile";

export interface SupervisionProfileRepository {
  readonly forKind: (kind: DeviceKind) => TE.TaskEither<never, O.Option<SupervisionProfile>>;
  readonly save: (profile: SupervisionProfile) => TE.TaskEither<never, void>;
}

export interface SupervisionProfileRepositoryEnv {
  readonly supervisionProfileRepository: SupervisionProfileRepository;
}

export const forKind =
  (kind: DeviceKind): ReaderTaskEither<SupervisionProfileRepositoryEnv, never, O.Option<SupervisionProfile>> =>
  (env) =>
    env.supervisionProfileRepository.forKind(kind);

export const save =
  (profile: SupervisionProfile): ReaderTaskEither<SupervisionProfileRepositoryEnv, never, void> =>
  (env) =>
    env.supervisionProfileRepository.save(profile);
