// L'aggregato del monitoring: una faccia di un device e la sua storia recente. Risponde a una
// sola domanda fattuale — "questa faccia risponde?" — e non conosce grace period, criticità né
// recupero: quel confine è ciò che regge tutto (§4.1).
// Anti-flapping: una transizione si emette solo dopo N osservazioni concordi, e il `since`
// dello stato nuovo è l'istante della **prima** osservazione della serie, non quello della
// conferma (INV-5 ci confronta il dispaccio di un rimedio).

import { Decider, type Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";
import type { FacetRef } from "./FacetRef";
import * as FlappingPolicy from "./FlappingPolicy";
import * as HealthStatus from "./HealthStatus";
import type { MonitoringEvent } from "./MonitoringEvent";
import type { ProbeOutcome } from "./ProbeOutcome";

// La serie di osservazioni concordi in corso. `consecutive` ne è la lunghezza: vale 0 esatta-
// mente quando non c'è serie aperta, e le due cose si muovono sempre insieme dentro `record`.
type Series = { readonly ok: boolean; readonly since: Instant };

export type FacetHealth = {
  readonly ref: FacetRef;
  readonly status: HealthStatus.HealthStatus;
  readonly consecutive: number;
  readonly pending: O.Option<Series>;
};

export const initial = (ref: FacetRef): FacetHealth => ({
  ref,
  status: HealthStatus.unknown,
  consecutive: 0,
  pending: O.none,
});

const confirmed = (health: FacetHealth, ok: boolean): boolean =>
  ok ? HealthStatus.isHealthy(health.status) : HealthStatus.isUnhealthy(health.status);

export const record = (
  health: FacetHealth,
  outcome: ProbeOutcome,
  policy: FlappingPolicy.FlappingPolicy,
): Decision<FacetHealth, MonitoringEvent> => {
  const continues = O.isSome(health.pending) && health.pending.value.ok === outcome.ok;
  const since = continues && O.isSome(health.pending) ? health.pending.value.since : outcome.at;
  const consecutive = continues ? health.consecutive + 1 : 1;
  const observed: FacetHealth = { ...health, consecutive, pending: O.some({ ok: outcome.ok, since }) };

  const enough = consecutive >= FlappingPolicy.thresholdFor(policy, outcome.ok);
  if (!enough || confirmed(health, outcome.ok)) return Decider.unchanged(observed);

  // Confermata: la serie si chiude e la prossima transizione dovrà guadagnarsi la sua soglia
  // intera. Il `since` che esce di qui è quello della prima osservazione della serie.
  const status = outcome.ok ? HealthStatus.healthy(since) : HealthStatus.unhealthy(since);
  const event: MonitoringEvent = outcome.ok
    ? { _tag: "FacetBecameHealthy", at: outcome.at, deviceId: health.ref.deviceId, facet: health.ref.facet, since }
    : { _tag: "FacetBecameUnhealthy", at: outcome.at, deviceId: health.ref.deviceId, facet: health.ref.facet, since };

  return Decider.decision({ ...health, status, consecutive: 0, pending: O.none }, [event]);
};
