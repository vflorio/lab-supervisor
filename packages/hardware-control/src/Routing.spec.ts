import * as Instant from "@lab/kernel/Instant";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as ProbeOutcome from "@lab/monitoring/domain/ProbeOutcome";
import type { HealthProbePort } from "@lab/monitoring/ports/HealthProbePort";
import * as Remedy from "@lab/recovery/domain/Remedy";
import * as RemedyOutcome from "@lab/recovery/domain/RemedyOutcome";
import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";
import * as Capability from "@lab/registry/domain/Capability";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type { DeviceLookup } from "./DeviceLookup";
import * as RoutingDeviceControl from "./RoutingDeviceControl";
import * as RoutingHealthProbe from "./RoutingHealthProbe";

const t0 = Instant.fromEpochMillis(1_000_000);
const clock = { now: () => t0 };

const registered = (id: string, kind: DeviceKind) => {
  const decision = Device.register(
    {
      id: DeviceId.of(id),
      kind,
      unitType: kind === "ControlUnit" ? O.some("candybox" as const) : O.none,
      capabilities: Capability.capabilitiesOfKind(kind),
    },
    t0,
  );
  if (E.isLeft(decision)) throw new Error("fixture non valida");
  return decision.right.state;
};

const lookupOf = (...devices: ReadonlyArray<Device.Device>): DeviceLookup => {
  const byId = new Map(devices.map((device) => [String(device.id), device]));
  return (id) => TE.right(O.fromNullable(byId.get(String(id))));
};

// Una porta che dice solo il proprio nome: basta a dimostrare chi è stato scelto.
const namedControl = (name: string, log: string[]): DeviceControlPort => ({
  apply: (_id, _remedy) =>
    TE.fromIO(() => {
      log.push(name);
      return RemedyOutcome.accepted;
    }),
});

const namedProbe = (name: string, log: string[]): HealthProbePort => ({
  probe: (ref) =>
    TE.fromIO(() => {
      log.push(name);
      return ProbeOutcome.make(ref, t0, true);
    }),
});

describe("RoutingDeviceControl", () => {
  it("le camere vanno ad adb, CU e TV a Suitest (FATTO-10, FATTO-11)", async () => {
    const camera = registered("cam-1", "AndroidCamera");
    const cu = registered("cu-1", "ControlUnit");
    const tv = registered("tv-1", "Tv");
    const log: string[] = [];
    const control = RoutingDeviceControl.make(
      RoutingDeviceControl.byKind(namedControl("adb", log), namedControl("suitest", log)),
      lookupOf(camera, cu, tv),
    );

    await control.apply(camera.id, Remedy.rebootHardware)();
    await control.apply(cu.id, Remedy.rebootHardware)();
    await control.apply(tv.id, Remedy.powerOn)();

    expect(log).toEqual(["adb", "suitest", "suitest"]);
  });

  it("una coppia (kind, rimedio) senza rotta è Unsupported, non un crash", async () => {
    const tv = registered("tv-2", "Tv");
    const log: string[] = [];
    // Domani la TV avrà rimedi Suitest e rimedi CDP: smistare sulla coppia è ciò che lo rende
    // una riga di tabella invece di una riscrittura (A-Ext-2).
    const route: RoutingDeviceControl.Route = (kind, remedy) =>
      kind === "Tv" && remedy._tag === "PowerOn" ? O.some(namedControl("suitest", log)) : O.none;
    const control = RoutingDeviceControl.make(route, lookupOf(tv));

    const result = await control.apply(tv.id, Remedy.rebootHardware)();
    expect(result).toEqual(E.right(RemedyOutcome.unsupported));
    expect(log).toEqual([]);
  });

  it("un device sconosciuto all'anagrafica non raggiunge nessuna porta", async () => {
    const log: string[] = [];
    const control = RoutingDeviceControl.make(
      RoutingDeviceControl.byKind(namedControl("adb", log), namedControl("suitest", log)),
      lookupOf(),
    );

    const result = await control.apply(DeviceId.of("fantasma"), Remedy.powerOn)();
    expect(result).toEqual(E.right(RemedyOutcome.rejected("device fantasma non presente in anagrafica")));
    expect(log).toEqual([]);
  });
});

describe("RoutingHealthProbe", () => {
  it("le due facce di una camera vanno a sonde diverse (FATTO-8)", async () => {
    const camera = registered("cam-2", "AndroidCamera");
    const log: string[] = [];
    const probe = RoutingHealthProbe.make(
      RoutingHealthProbe.byFacet(namedProbe("adb", log), namedProbe("suitest", log)),
      lookupOf(camera),
      clock,
    );

    await probe.probe(FacetRef.make(camera.id, "AdbTransport"))();
    await probe.probe(FacetRef.make(camera.id, "StreamAvailable"))();

    expect(log).toEqual(["adb", "suitest"]);
  });

  it("una faccia senza sonda per quel kind lo dice, invece di far passare per malato un device sano", async () => {
    const tv = registered("tv-3", "Tv");
    const log: string[] = [];
    const probe = RoutingHealthProbe.make(
      RoutingHealthProbe.byFacet(namedProbe("adb", log), namedProbe("suitest", log)),
      lookupOf(tv),
      clock,
    );

    const result = await probe.probe(FacetRef.make(tv.id, "AdbTransport"))();
    expect(result).toEqual(
      E.right(
        ProbeOutcome.make(
          FacetRef.make(tv.id, "AdbTransport"),
          t0,
          false,
          O.some("nessuna sonda per AdbTransport su un Tv"),
        ),
      ),
    );
    expect(log).toEqual([]);
  });
});
