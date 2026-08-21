// La finestra è un'autorizzazione, non un orario (FATTO-14).

import * as Instant from "@lab/kernel/Instant";
import { describe, expect, it } from "vitest";
import * as SupervisionWindow from "./SupervisionWindow";

// Lunedì 12 gennaio 2026, ore 10:00 a Roma (09:00 UTC).
const mondayMorning = Instant.fromEpochMillis(Date.UTC(2026, 0, 12, 9, 0, 0));
const mondayNight = Instant.fromEpochMillis(Date.UTC(2026, 0, 12, 22, 0, 0));
const saturdayMorning = Instant.fromEpochMillis(Date.UTC(2026, 0, 17, 9, 0, 0));

const labHours = SupervisionWindow.make(
  SupervisionWindow.workdays,
  SupervisionWindow.time(9),
  SupervisionWindow.time(18),
  "Europe/Rome",
);

describe("SupervisionWindow", () => {
  it("authorized during business hours", () => {
    expect(SupervisionWindow.isOpen(labHours, mondayMorning)).toBe(true);
  });

  it("not at night: this is how no device wakes up at 3am", () => {
    expect(SupervisionWindow.isOpen(labHours, mondayNight)).toBe(false);
  });

  it("nel weekend no, anche in orario", () => {
    expect(SupervisionWindow.isOpen(labHours, saturdayMorning)).toBe(false);
  });

  it("la zona conta: la stessa istante letto a Tokyo cade fuori", () => {
    const tokyo = SupervisionWindow.make(
      SupervisionWindow.workdays,
      SupervisionWindow.time(9),
      SupervisionWindow.time(18),
      "Asia/Tokyo",
    );
    expect(SupervisionWindow.isOpen(tokyo, mondayMorning)).toBe(false);
  });

  it("`always` is always open and `closed` never is", () => {
    expect(SupervisionWindow.isOpen(SupervisionWindow.always, mondayNight)).toBe(true);
    expect(SupervisionWindow.isOpen(SupervisionWindow.always, saturdayMorning)).toBe(true);
    expect(SupervisionWindow.isOpen(SupervisionWindow.closed, mondayMorning)).toBe(false);
  });
});
