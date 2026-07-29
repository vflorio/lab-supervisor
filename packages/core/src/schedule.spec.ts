import { describe, expect, it } from "vitest";
import {
  always,
  block,
  day,
  duration,
  invert,
  MonoidIntersection,
  MonoidUnion,
  never,
  recurring,
  subtract,
  timeRange,
  timeSlot,
  weekdays,
  weekend,
  withBlackout,
} from "./schedule";

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

describe("day", () => {
  it("active only on the specified day", () => {
    const lunedi = day(0);
    expect(lunedi(timeSlot(0, 10, 0))).toBe(true);
    expect(lunedi(timeSlot(1, 10, 0))).toBe(false);
    expect(lunedi(timeSlot(6, 10, 0))).toBe(false);
  });
});

describe("timeRange", () => {
  it("active within the time range, upper bound excluded", () => {
    const range = timeRange([9, 0], [17, 0]);
    expect(range(timeSlot(0, 9, 0))).toBe(true);
    expect(range(timeSlot(0, 12, 30))).toBe(true);
    expect(range(timeSlot(0, 16, 59))).toBe(true);
    expect(range(timeSlot(0, 17, 0))).toBe(false);
    expect(range(timeSlot(0, 8, 59))).toBe(false);
  });
});

describe("duration", () => {
  it("active for the specified duration starting from the given time", () => {
    const slot = duration([14, 30], 20);
    expect(slot(timeSlot(0, 14, 30))).toBe(true);
    expect(slot(timeSlot(0, 14, 49))).toBe(true);
    expect(slot(timeSlot(0, 14, 50))).toBe(false);
    expect(slot(timeSlot(0, 14, 29))).toBe(false);
  });
});

describe("recurring", () => {
  it("active for D minutes every N minutes", () => {
    const rec = recurring(60, 10);
    // minuto 0-9 di ogni ora: attivo
    expect(rec(timeSlot(0, 0, 0))).toBe(true);
    expect(rec(timeSlot(0, 0, 9))).toBe(true);
    expect(rec(timeSlot(0, 0, 10))).toBe(false);
    expect(rec(timeSlot(0, 1, 5))).toBe(true);
    expect(rec(timeSlot(0, 1, 15))).toBe(false);
  });
});

describe("always / never", () => {
  it("always is always active, never is never active", () => {
    const slot = timeSlot(3, 12, 30);
    expect(always(slot)).toBe(true);
    expect(never(slot)).toBe(false);
  });
});

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

describe("invert", () => {
  it("inverts the schedule visibility", () => {
    const inverted = invert(always);
    expect(inverted(timeSlot(0, 0, 0))).toBe(false);
    expect(invert(never)(timeSlot(0, 0, 0))).toBe(true);
  });
});

// -------------------------------------------------------------------------------------
// Monoid instances
// -------------------------------------------------------------------------------------

describe("ScheduleUnion", () => {
  it("active if at least one of the two schedules is active", () => {
    const lun = day(0);
    const mar = day(1);
    const union = MonoidUnion.concat(lun, mar);
    expect(union(timeSlot(0, 10, 0))).toBe(true);
    expect(union(timeSlot(1, 10, 0))).toBe(true);
    expect(union(timeSlot(2, 10, 0))).toBe(false);
  });

  it("empty is the identity (never active)", () => {
    const s = day(0);
    const withEmpty = MonoidUnion.concat(s, MonoidUnion.empty);
    expect(withEmpty(timeSlot(0, 10, 0))).toBe(s(timeSlot(0, 10, 0)));
    expect(withEmpty(timeSlot(1, 10, 0))).toBe(s(timeSlot(1, 10, 0)));
  });
});

describe("ScheduleIntersection", () => {
  it("active only if both schedules are active", () => {
    const lun = day(0);
    const mattina = timeRange([9, 0], [13, 0]);
    const inter = MonoidIntersection.concat(lun, mattina);
    expect(inter(timeSlot(0, 10, 0))).toBe(true);
    expect(inter(timeSlot(0, 14, 0))).toBe(false);
    expect(inter(timeSlot(1, 10, 0))).toBe(false);
  });

  it("empty is the identity (always active)", () => {
    const s = day(0);
    const withEmpty = MonoidIntersection.concat(s, MonoidIntersection.empty);
    expect(withEmpty(timeSlot(0, 10, 0))).toBe(s(timeSlot(0, 10, 0)));
    expect(withEmpty(timeSlot(1, 10, 0))).toBe(s(timeSlot(1, 10, 0)));
  });
});

// -------------------------------------------------------------------------------------
// Derived combinators
// -------------------------------------------------------------------------------------

describe("block", () => {
  it("active only on a specific day and time range", () => {
    const b = block(2, [9, 0], [18, 0]);
    expect(b(timeSlot(2, 12, 0))).toBe(true);
    expect(b(timeSlot(2, 8, 0))).toBe(false);
    expect(b(timeSlot(0, 12, 0))).toBe(false);
  });
});

describe("weekdays", () => {
  it("active Mon-Fri within the time range", () => {
    const wd = weekdays([9, 0], [18, 0]);
    for (let d = 0; d <= 4; d++) {
      expect(wd(timeSlot(d, 12, 0))).toBe(true);
    }
    expect(wd(timeSlot(5, 12, 0))).toBe(false);
    expect(wd(timeSlot(6, 12, 0))).toBe(false);
  });
});

describe("weekend", () => {
  it("active Sat-Sun within the time range", () => {
    const we = weekend([10, 0], [16, 0]);
    expect(we(timeSlot(5, 12, 0))).toBe(true);
    expect(we(timeSlot(6, 12, 0))).toBe(true);
    expect(we(timeSlot(0, 12, 0))).toBe(false);
  });
});

describe("withBlackout", () => {
  it("removes a window from a schedule", () => {
    const base = weekdays([9, 0], [18, 0]);
    const blacked = withBlackout(base, [12, 0], [13, 0]);
    expect(blacked(timeSlot(0, 10, 0))).toBe(true);
    expect(blacked(timeSlot(0, 12, 30))).toBe(false);
    expect(blacked(timeSlot(0, 13, 0))).toBe(true);
  });
});

describe("subtract", () => {
  it("subtracts one schedule from another", () => {
    const base = always;
    const exclude = day(6);
    const result = subtract(base, exclude);
    expect(result(timeSlot(0, 10, 0))).toBe(true);
    expect(result(timeSlot(6, 10, 0))).toBe(false);
  });
});
