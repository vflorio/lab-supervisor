import { describe, expect, it } from "vitest";
import * as Duration from "../Duration";
import * as Instant from "../Instant";
import * as FakeClock from "./FakeClock";

describe("FakeClock", () => {
  it("attraversa un grace period senza aspettarlo", () => {
    const clock = FakeClock.make(Instant.fromEpochMillis(0));
    expect(Instant.toEpochMillis(clock.now())).toBe(0);
    clock.advance(Duration.minutes(3));
    expect(Instant.toEpochMillis(clock.read())).toBe(180_000);
    clock.set(Instant.fromEpochMillis(42));
    expect(Instant.toEpochMillis(clock.now())).toBe(42);
  });
});
