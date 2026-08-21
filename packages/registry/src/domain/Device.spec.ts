import * as Instant from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Capability from "./Capability";
import * as Custody from "./Custody";
import * as Device from "./Device";
import * as DeviceId from "./DeviceId";
import * as RecordingSessionId from "./RecordingSessionId";

const t0 = Instant.fromEpochMillis(0);

const registered = (draft: Device.Draft): Device.Device => {
  const result = Device.register(draft, t0);
  if (E.isLeft(result)) throw new Error(`draft non valido: ${result.left._tag}`);
  return result.right.state;
};

const cu = registered({ id: DeviceId.of("cu-1"), kind: "ControlUnit", unitType: O.some("candybox") });
const tv = registered({ id: DeviceId.of("tv-1"), kind: "Tv" });
const camera = registered({ id: DeviceId.of("cam-1"), kind: "AndroidCamera" });

describe("Device · anagrafica", () => {
  it("solo una ControlUnit ha un ControlUnitType, e ne ha sempre uno", () => {
    expect(E.isLeft(Device.register({ id: DeviceId.of("cu-2"), kind: "ControlUnit" }, t0))).toBe(true);
    expect(E.isLeft(Device.register({ id: DeviceId.of("tv-2"), kind: "Tv", unitType: O.some("drive") }, t0))).toBe(
      true,
    );
  });

  it("un'istanza non dichiara capability che il suo tipo non potrà mai avere (FATTO-1)", () => {
    const absurd = Device.register(
      { id: DeviceId.of("tv-3"), kind: "Tv", capabilities: Capability.setOf("AdbTcp") },
      t0,
    );
    expect(E.isLeft(absurd)).toBe(true);
  });

  it("una CU può non dichiarare RebootHardware: è la verità della singola unità (FATTO-1)", () => {
    const unit = registered({
      id: DeviceId.of("cu-3"),
      kind: "ControlUnit",
      unitType: O.some("solo-candy"),
      capabilities: Capability.setOf("PowerOn"),
    });
    expect(Device.can(unit, "RebootHardware")).toBe(false);
  });

  it("nasce senza genitore, in custodia al supervisore e monitorato", () => {
    expect(O.isNone(tv.attachment)).toBe(true);
    expect(tv.custody._tag).toBe("Supervisor");
    expect(tv.monitored).toBe(true);
  });
});

describe("Device · attacco (INV-12)", () => {
  it("una TV dipende da una CU; una camera inquadra una TV", () => {
    expect(E.isRight(Device.attach(tv, cu, "DependsOn", t0))).toBe(true);
    expect(E.isRight(Device.attach(camera, tv, "Observes", t0))).toBe(true);
  });

  it("una camera non dipende mai da una CU (FATTO-3, NF-2)", () => {
    expect(E.isLeft(Device.attach(camera, cu, "DependsOn", t0))).toBe(true);
    expect(E.isLeft(Device.attach(camera, tv, "DependsOn", t0))).toBe(true);
  });

  it("una TV non si attacca con Observes, e una CU non ha genitore", () => {
    expect(E.isLeft(Device.attach(tv, cu, "Observes", t0))).toBe(true);
    expect(E.isLeft(Device.attach(cu, tv, "DependsOn", t0))).toBe(true);
  });
});

describe("Device · custodia", () => {
  it("un maintenance hold rende il device non supervisionabile (FATTO-15)", () => {
    const held = Device.placeMaintenanceHold(tv, "sostituzione HDMI", t0);
    expect(Device.isSupervisable(held.state, t0)).toBe(false);
    expect(held.events.map((event) => event._tag)).toEqual(["MaintenanceHoldPlaced"]);
  });

  it("non si concede la custodia di un device che è già in mano a un operatore", () => {
    const held = Device.placeMaintenanceHold(tv, "manutenzione", t0).state;
    const granted = Device.grantCustody(held, Custody.recorder(RecordingSessionId.of("rec-1"), t0), t0);
    expect(E.isLeft(granted)).toBe(true);
  });

  it("togliere un hold che non c'è non è un errore: è un non-fatto", () => {
    expect(Device.liftMaintenanceHold(tv, t0).events).toEqual([]);
  });

  it("un device ritirato esce dal monitoraggio", () => {
    const retired = Device.retire(tv, t0);
    expect(retired.state.monitored).toBe(false);
    expect(retired.events.map((event) => event._tag)).toEqual(["DeviceRetired"]);
  });
});
