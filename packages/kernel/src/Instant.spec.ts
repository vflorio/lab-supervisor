import { describe, expect, it } from "vitest";
import * as Duration from "./Duration";
import * as Instant from "./Instant";

const t0 = Instant.fromEpochMillis(1_000_000);

describe("Instant", () => {
  it("somma e sottrae durate senza perdere il riferimento", () => {
    expect(Instant.toEpochMillis(Instant.plus(t0, Duration.seconds(30)))).toBe(1_030_000);
    expect(Instant.toEpochMillis(Instant.minus(t0, Duration.minutes(1)))).toBe(940_000);
  });

  it("misura una distanza non orientata", () => {
    const t1 = Instant.plus(t0, Duration.seconds(45));
    expect(Duration.toMillis(Instant.between(t0, t1))).toBe(45_000);
    expect(Duration.toMillis(Instant.between(t1, t0))).toBe(45_000);
  });

  it("confronta due istanti", () => {
    const t1 = Instant.plus(t0, Duration.millis(1));
    expect(Instant.isAtOrAfter(t1, t0)).toBe(true);
    expect(Instant.isAtOrAfter(t0, t0)).toBe(true);
    expect(Instant.isAfter(t0, t0)).toBe(false);
    expect(Instant.isBefore(t0, t1)).toBe(true);
  });

  it("sceglie il primo e l'ultimo di una serie", () => {
    const a = Instant.fromEpochMillis(10);
    const b = Instant.fromEpochMillis(30);
    const c = Instant.fromEpochMillis(20);
    expect(Instant.earliestOf([a, b, c])).toBe(a);
    expect(Instant.latestOf([a, b, c])).toBe(b);
    expect(Instant.earliest(a, b)).toBe(a);
    expect(Instant.latest(a, b)).toBe(b);
  });
});
