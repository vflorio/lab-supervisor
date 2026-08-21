import { describe, expect, it } from "vitest";
import * as Duration from "./Duration";

describe("Duration", () => {
  it("converts units to milliseconds", () => {
    expect(Duration.toMillis(Duration.seconds(30))).toBe(30_000);
    expect(Duration.toMillis(Duration.minutes(3))).toBe(180_000);
    expect(Duration.toMillis(Duration.hours(1))).toBe(3_600_000);
  });

  it("azzera le durate negative invece di rifiutarle", () => {
    expect(Duration.toMillis(Duration.seconds(-5))).toBe(0);
  });

  it("compone durate", () => {
    expect(Duration.toMillis(Duration.plus(Duration.seconds(10), Duration.seconds(5)))).toBe(15_000);
    expect(Duration.toMillis(Duration.times(Duration.seconds(10), 3))).toBe(30_000);
    expect(Duration.toMillis(Duration.min(Duration.seconds(10), Duration.seconds(5)))).toBe(5_000);
    expect(Duration.toMillis(Duration.max(Duration.seconds(10), Duration.seconds(5)))).toBe(10_000);
  });
});
