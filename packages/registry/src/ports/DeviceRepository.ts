// La porta dell'anagrafica: quattro domande che il dominio si pone davvero, non un
// `Repository<T>` generico con `findAll`/`where`, che sarebbe il database travestito (A-8).
// Il canale d'errore è `never`: in questo giro non esiste persistenza reale (NO-14) e un
// fallimento di lettura non è un esito di dominio. Il giorno in cui arriverà, il canale si
// aggiunge qui e il compilatore indica ogni chiamante.

import type * as O from "fp-ts/Option";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { Device } from "../domain/Device";
import type { DeviceId } from "../domain/DeviceId";
import type { DeviceKind } from "../domain/DeviceKind";
import type { Topology } from "../domain/Topology";

export interface DeviceRepository {
  readonly findById: (id: DeviceId) => TE.TaskEither<never, O.Option<Device>>;
  readonly findByKind: (kind: DeviceKind) => TE.TaskEither<never, ReadonlyArray<Device>>;
  readonly topology: () => TE.TaskEither<never, Topology>;
  readonly save: (device: Device) => TE.TaskEither<never, void>;
}

export interface DeviceRepositoryEnv {
  readonly deviceRepository: DeviceRepository;
}

export const findById =
  (id: DeviceId): ReaderTaskEither<DeviceRepositoryEnv, never, O.Option<Device>> =>
  (env) =>
    env.deviceRepository.findById(id);

export const findByKind =
  (kind: DeviceKind): ReaderTaskEither<DeviceRepositoryEnv, never, ReadonlyArray<Device>> =>
  (env) =>
    env.deviceRepository.findByKind(kind);

export const topology = (): ReaderTaskEither<DeviceRepositoryEnv, never, Topology> => (env) =>
  env.deviceRepository.topology();

export const save =
  (device: Device): ReaderTaskEither<DeviceRepositoryEnv, never, void> =>
  (env) =>
    env.deviceRepository.save(device);
