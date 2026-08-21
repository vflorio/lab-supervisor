import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { compose, decode, type ScheduleJson } from "./codec";
import { timeSlot } from "./schedule";

describe("Schedule codec", () => {
  it("decodes a single verb", () => {
    const json: ScheduleJson = [["union", ["timeRange", "09:00", "18:00"]]];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(timeSlot(0, 10, 0))).toBe(true);
      expect(result.right(timeSlot(0, 20, 0))).toBe(false);
    }
  });

  it("composes union/subtract across steps", () => {
    // Feriali 9-18, tranne lunedì
    const json: ScheduleJson = [
      ["union", ["weekdays", "09:00", "18:00"]],
      ["subtract", ["day", "monday"]],
    ];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(timeSlot(0, 10, 0))).toBe(false); // lunedì escluso
      expect(result.right(timeSlot(1, 10, 0))).toBe(true); // martedì incluso
    }
  });

  it("composes intersection", () => {
    const json: ScheduleJson = [
      ["union", ["always"]],
      ["intersection", ["timeRange", "09:00", "18:00"]],
    ];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(timeSlot(3, 10, 0))).toBe(true);
      expect(result.right(timeSlot(3, 20, 0))).toBe(false);
    }
  });

  it("resolves duration/recurring args as DurationString minutes", () => {
    const json: ScheduleJson = [["union", ["recurring", "30m", "5m"]]];
    const result = decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(timeSlot(0, 0, 2))).toBe(true);
      expect(result.right(timeSlot(0, 0, 10))).toBe(false);
    }
  });

  it("treats an empty schedule as never", () => {
    const result = decode([]);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right(timeSlot(0, 12, 0))).toBe(false);
    }
  });

  it("errors on unknown verb", () => {
    const result = decode([["union", ["unknownVerb"]]]);
    expect(E.isLeft(result)).toBe(true);
  });

  it("compose exposes intermediate results", () => {
    const json: ScheduleJson = [
      ["union", ["day", "monday"]],
      ["union", ["day", "tuesday"]],
    ];
    const result = compose(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toHaveLength(2);
      expect(result.right[0]!.result(timeSlot(0, 0, 0))).toBe(true);
      expect(result.right[1]!.result(timeSlot(1, 0, 0))).toBe(true);
    }
  });
});
