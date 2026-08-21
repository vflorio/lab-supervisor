// Lo stato *confermato* di una faccia, cioè quello che sopravvive all'anti-flapping. Il rumore
// non arriva mai fin qui, e per questo il core può fidarsene senza sonde proprie (§4.1).
// `since` è l'istante della **prima** osservazione della serie che ha causato la transizione,
// non quello della conferma: è il dato con cui INV-5 distingue una guarigione vera da una
// lettura stantia, e sbagliarlo rende quel confronto inutile.

import type { Instant } from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";

export type HealthStatus =
  | { readonly _tag: "Unknown" }
  | { readonly _tag: "Healthy"; readonly since: Instant }
  | { readonly _tag: "Unhealthy"; readonly since: Instant };

export const unknown: HealthStatus = { _tag: "Unknown" };

export const healthy = (since: Instant): HealthStatus => ({ _tag: "Healthy", since });

export const unhealthy = (since: Instant): HealthStatus => ({ _tag: "Unhealthy", since });

export const isHealthy = (status: HealthStatus): boolean => status._tag === "Healthy";

export const isUnhealthy = (status: HealthStatus): boolean => status._tag === "Unhealthy";

export const since = (status: HealthStatus): O.Option<Instant> =>
  status._tag === "Unknown" ? O.none : O.some(status.since);
