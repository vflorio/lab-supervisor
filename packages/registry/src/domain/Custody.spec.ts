import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import { describe, expect, it } from "vitest";
import * as Custody from "./Custody";
import * as RecordingSessionId from "./RecordingSessionId";

const t0 = Instant.fromEpochMillis(0);

describe("Custody", () => {
  it("il supervisore comanda solo se nessun altro ha il device in mano", () => {
    expect(Custody.allowsSupervisor(Custody.supervisor, t0)).toBe(true);
    expect(Custody.allowsSupervisor(Custody.operator("sostituzione cavo", t0), t0)).toBe(false);
  });

  it("un maintenance hold non scade da solo (FATTO-15)", () => {
    const hold = Custody.operator("manutenzione", t0);
    expect(Custody.allowsSupervisor(hold, Instant.plus(t0, Duration.hours(24)))).toBe(false);
    expect(Custody.isMaintenanceHold(hold)).toBe(true);
  });

  it("an expired custody of the recorder is no longer a custody", () => {
    const until = Instant.plus(t0, Duration.minutes(10));
    const custody = Custody.recorder(RecordingSessionId.of("rec-1"), until);
    expect(Custody.allowsSupervisor(custody, Instant.plus(t0, Duration.minutes(5)))).toBe(false);
    expect(Custody.allowsSupervisor(custody, until)).toBe(true);
  });
});
