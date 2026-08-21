// Una fotografia immutabile della salute confermata di più facce, costruita dal repository e
// consegnata a recovery dentro il `SupervisionContext`.
// È il modo in cui recovery legge la salute *senza possedere sonde* (§4.1): la verifica di un
// rimedio guarda questa fotografia, non esegue una sonda propria. Tre conseguenze: l'anti-
// flapping vale anche per la verifica, non esistono due verità sulla salute, e la sessione
// resta pura perché il contesto le arriva già risolto.

import type { DeviceId } from "@lab/registry/domain/DeviceId";
import { pipe } from "fp-ts/function";
import * as OrdModule from "fp-ts/Ord";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import * as FacetHealth from "./FacetHealth";
import * as FacetRef from "./FacetRef";
import * as HealthStatus from "./HealthStatus";

const byRef: OrdModule.Ord<FacetHealth.FacetHealth> = OrdModule.contramap((health: FacetHealth.FacetHealth) =>
  FacetRef.key(health.ref),
)(S.Ord);

export type HealthSnapshot = {
  readonly facets: ReadonlyMap<string, FacetHealth.FacetHealth>;
};

export const of = (healths: ReadonlyArray<FacetHealth.FacetHealth>): HealthSnapshot => ({
  facets: new Map(healths.map((health) => [FacetRef.key(health.ref), health])),
});

export const empty: HealthSnapshot = of([]);

// Una faccia mai sondata è `Unknown`, non sana: non sapere non è una buona notizia.
export const healthOf = (snapshot: HealthSnapshot, ref: FacetRef.FacetRef): FacetHealth.FacetHealth =>
  snapshot.facets.get(FacetRef.key(ref)) ?? FacetHealth.initial(ref);

export const statusOf = (snapshot: HealthSnapshot, ref: FacetRef.FacetRef): HealthStatus.HealthStatus =>
  healthOf(snapshot, ref).status;

export const isHealthy = (snapshot: HealthSnapshot, ref: FacetRef.FacetRef): boolean =>
  HealthStatus.isHealthy(statusOf(snapshot, ref));

// Tutte le facce di un device: è ciò che l'`Incident` fotografa al momento della resa (M-7).
export const facesOf = (snapshot: HealthSnapshot, deviceId: DeviceId): ReadonlyArray<FacetHealth.FacetHealth> =>
  pipe(
    [...snapshot.facets.values()],
    RA.filter((health) => health.ref.deviceId === deviceId),
    RA.sort(byRef),
  );

export const merge = (snapshot: HealthSnapshot, healths: ReadonlyArray<FacetHealth.FacetHealth>): HealthSnapshot => {
  const facets = new Map(snapshot.facets);
  for (const health of healths) facets.set(FacetRef.key(health.ref), health);
  return { facets };
};
