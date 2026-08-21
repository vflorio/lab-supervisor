// Adapter finto della salute: una mappa indicizzata per `FacetRef`. Nessun tempo, nessuna
// rete — è ciò che permette agli scenari di far scorrere ore simulate in millisecondi.

import type { DeviceId } from "@lab/registry/domain/DeviceId";
import * as TE from "fp-ts/TaskEither";
import type { Facet } from "../domain/Facet";
import type { FacetHealth } from "../domain/FacetHealth";
import * as FacetRef from "../domain/FacetRef";
import * as HealthSnapshot from "../domain/HealthSnapshot";
import * as HealthStatus from "../domain/HealthStatus";
import type { FacetHealthRepository } from "../ports/FacetHealthRepository";

export interface InMemoryFacetHealthRepository extends FacetHealthRepository {
  readonly all: () => ReadonlyArray<FacetHealth>;
  readonly put: (health: FacetHealth) => void;
}

export const make = (seed: ReadonlyArray<FacetHealth> = []): InMemoryFacetHealthRepository => {
  const facets = new Map<string, FacetHealth>(seed.map((health) => [FacetRef.key(health.ref), health]));
  const all = () => [...facets.values()];

  return {
    all,
    put: (health) => {
      facets.set(FacetRef.key(health.ref), health);
    },
    statusOf: (ref) => TE.right(facets.get(FacetRef.key(ref))?.status ?? HealthStatus.unknown),
    snapshotOf: (deviceIds: ReadonlyArray<DeviceId>) =>
      TE.right(HealthSnapshot.of(all().filter((health) => deviceIds.includes(health.ref.deviceId)))),
    allUnhealthy: (facet: Facet) =>
      TE.right(all().filter((health) => health.ref.facet === facet && HealthStatus.isUnhealthy(health.status))),
    saveAll: (healths) =>
      TE.fromIO(() => {
        for (const health of healths) facets.set(FacetRef.key(health.ref), health);
      }),
  };
};
