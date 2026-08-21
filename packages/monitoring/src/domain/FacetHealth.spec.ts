// L'invariante di questo contesto: il rumore non deve mai arrivare al core, e il `since` di una
// transizione è l'istante della PRIMA osservazione della serie (è ciò che INV-5 confronta con
// l'istante di dispaccio di un rimedio).

import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as FacetHealth from "./FacetHealth";
import * as FacetRef from "./FacetRef";
import * as FlappingPolicy from "./FlappingPolicy";
import * as HealthStatus from "./HealthStatus";
import * as ProbeOutcome from "./ProbeOutcome";

const ref = FacetRef.make(DeviceId.of("cam-1"), "StreamAvailable");
const t = (seconds: number) => Instant.plus(Instant.fromEpochMillis(0), Duration.seconds(seconds));
const policy = FlappingPolicy.make(3, 2);

const apply = (start: FacetHealth.FacetHealth, observations: ReadonlyArray<readonly [number, boolean]>) =>
  observations.reduce(
    (acc, [at, ok]) => {
      const decision = FacetHealth.record(acc.health, ProbeOutcome.make(ref, t(at), ok), policy);
      return { health: decision.state, events: [...acc.events, ...decision.events] };
    },
    { health: start, events: [] as ReadonlyArray<{ readonly _tag: string }> },
  );

describe("FacetHealth · anti-flapping", () => {
  it("sotto soglia non cambia stato e non emette nulla", () => {
    const { health, events } = apply(FacetHealth.initial(ref), [
      [0, false],
      [10, false],
    ]);
    expect(health.status).toEqual(HealthStatus.unknown);
    expect(events).toEqual([]);
  });

  it("alla soglia conferma il guasto e lo data alla PRIMA osservazione della serie", () => {
    const { health, events } = apply(FacetHealth.initial(ref), [
      [0, false],
      [10, false],
      [20, false],
    ]);
    expect(health.status).toEqual(HealthStatus.unhealthy(t(0)));
    expect(events).toEqual([
      { _tag: "FacetBecameUnhealthy", at: t(20), deviceId: ref.deviceId, facet: ref.facet, since: t(0) },
    ]);
  });

  it("a broken series restarts: two down, one up, two down is not a failure", () => {
    const { health, events } = apply(FacetHealth.initial(ref), [
      [0, false],
      [10, false],
      [20, true],
      [30, false],
      [40, false],
    ]);
    expect(health.status).toEqual(HealthStatus.unknown);
    expect(events).toEqual([]);
  });

  it("la guarigione ha una soglia sua, e riparte dalla prima osservazione buona", () => {
    const down = apply(FacetHealth.initial(ref), [
      [0, false],
      [10, false],
      [20, false],
    ]).health;
    const { health, events } = apply(down, [
      [30, true],
      [40, true],
    ]);
    expect(health.status).toEqual(HealthStatus.healthy(t(30)));
    expect(events.map((event) => event._tag)).toEqual(["FacetBecameHealthy"]);
  });

  it("observations consistent with already confirmed state do not re-emit the event", () => {
    const down = apply(FacetHealth.initial(ref), [
      [0, false],
      [10, false],
      [20, false],
    ]).health;
    const { health, events } = apply(down, [
      [30, false],
      [40, false],
      [50, false],
    ]);
    expect(health.status).toEqual(HealthStatus.unhealthy(t(0)));
    expect(events).toEqual([]);
  });

  it("dopo una conferma la serie si azzera: la transizione opposta si guadagna la soglia intera", () => {
    const down = apply(FacetHealth.initial(ref), [
      [0, false],
      [10, false],
      [20, false],
    ]).health;
    expect(down.consecutive).toBe(0);
    expect(O.isNone(down.pending)).toBe(true);
    expect(apply(down, [[30, true]]).events).toEqual([]);
  });
});
