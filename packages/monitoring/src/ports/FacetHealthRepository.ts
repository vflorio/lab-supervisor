// Quattro domande che il monitoring si pone davvero (A-8): com'è messa questa faccia, dammi la
// fotografia di questi device, chi è giù su questa faccia, salva quello che è cambiato.
// `allUnhealthy` è la domanda con cui recovery costruisce l'`OutageSnapshot` da correlare: è
// una lettura di fatti, non una richiesta di intervento.

import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { Facet } from "../domain/Facet";
import type { FacetHealth } from "../domain/FacetHealth";
import type { FacetRef } from "../domain/FacetRef";
import type { HealthSnapshot } from "../domain/HealthSnapshot";
import type { HealthStatus } from "../domain/HealthStatus";

export interface FacetHealthRepository {
  readonly statusOf: (ref: FacetRef) => TE.TaskEither<never, HealthStatus>;
  readonly snapshotOf: (deviceIds: ReadonlyArray<DeviceId>) => TE.TaskEither<never, HealthSnapshot>;
  readonly allUnhealthy: (facet: Facet) => TE.TaskEither<never, ReadonlyArray<FacetHealth>>;
  readonly saveAll: (healths: ReadonlyArray<FacetHealth>) => TE.TaskEither<never, void>;
}

export interface FacetHealthRepositoryEnv {
  readonly facetHealthRepository: FacetHealthRepository;
}

export const statusOf =
  (ref: FacetRef): ReaderTaskEither<FacetHealthRepositoryEnv, never, HealthStatus> =>
  (env) =>
    env.facetHealthRepository.statusOf(ref);

export const snapshotOf =
  (deviceIds: ReadonlyArray<DeviceId>): ReaderTaskEither<FacetHealthRepositoryEnv, never, HealthSnapshot> =>
  (env) =>
    env.facetHealthRepository.snapshotOf(deviceIds);

export const allUnhealthy =
  (facet: Facet): ReaderTaskEither<FacetHealthRepositoryEnv, never, ReadonlyArray<FacetHealth>> =>
  (env) =>
    env.facetHealthRepository.allUnhealthy(facet);

export const saveAll =
  (healths: ReadonlyArray<FacetHealth>): ReaderTaskEither<FacetHealthRepositoryEnv, never, void> =>
  (env) =>
    env.facetHealthRepository.saveAll(healths);
