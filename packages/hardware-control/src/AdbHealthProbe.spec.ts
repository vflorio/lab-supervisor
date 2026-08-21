import * as Instant from "@lab/kernel/Instant";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as Capability from "@lab/registry/domain/Capability";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as Endpoints from "@lab/registry/domain/Endpoints";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as AdbHealthProbe from "./AdbHealthProbe";
import type { DeviceLookup } from "./DeviceLookup";
import * as FakeAdb from "./testing/FakeAdb";

const t0 = Instant.fromEpochMillis(1_000_000);
const endpoint = "10.0.0.9:5555";
const clock = { now: () => t0 };

// La sonda non tocca l'app: le basta il binario e i timeout.
const config: AdbHealthProbe.AdbConfig = {
  binary: "adb",
  commandTimeoutMs: 15_000,
  bootTimeoutMs: 90_000,
  captureApp: {
    packageId: "com.suitest.android.camera",
    activity: "com.suitest.android.camera.CameraActivity",
    profileTaps: [],
    connectTaps: [],
    settleAfterLaunchMs: 0,
  },
};

const camera = (adb?: string) => {
  const decision = Device.register(
    {
      id: DeviceId.of("cam-1"),
      kind: "AndroidCamera",
      endpoints: Endpoints.make(adb ? { adb: O.some(Endpoints.adbEndpoint(adb)) } : {}),
      capabilities: Capability.capabilitiesOfKind("AndroidCamera"),
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

const run = async (port: ReturnType<typeof AdbHealthProbe.make>, ref: FacetRef.FacetRef) => {
  const result = await port.probe(ref)();
  if (E.isLeft(result)) throw new Error("la porta non ha canale d'errore");
  return result.right;
};

describe("AdbHealthProbe", () => {
  it("a listed and alive transport is healthy", async () => {
    const device = camera(endpoint);
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    const probe = AdbHealthProbe.make(config, { lookup: lookupOf(device), clock, spawn: adb.spawn });

    expect((await run(probe, FacetRef.make(device.id, "AdbTransport"))).ok).toBe(true);
  });

  it("a transport absent from `adb devices` is down, and it says so", async () => {
    const device = camera(endpoint);
    const adb = FakeAdb.make();
    const probe = AdbHealthProbe.make(config, { lookup: lookupOf(device), clock, spawn: adb.spawn });

    const outcome = await run(probe, FacetRef.make(device.id, "AdbTransport"));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("transport assente da `adb devices`"));
  });

  it("a transport listed in `offline` state is not healthy", async () => {
    const device = camera(endpoint);
    const adb = FakeAdb.make([{ endpoint, state: "offline" }]);
    const probe = AdbHealthProbe.make(config, { lookup: lookupOf(device), clock, spawn: adb.spawn });

    const outcome = await run(probe, FacetRef.make(device.id, "AdbTransport"));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("transport in stato offline"));
  });

  it("un transport elencato come `device` ma incastrato non passa: la sonda manda un comando vero (FATTO-8)", async () => {
    const device = camera(endpoint);
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    // `adb devices` risponde, il comando sul device no: è esattamente il transport incastrato.
    adb.failOn("shell", { _tag: "Timeout", afterMs: 15_000 });
    const probe = AdbHealthProbe.make(config, { lookup: lookupOf(device), clock, spawn: adb.spawn });

    const outcome = await run(probe, FacetRef.make(device.id, "AdbTransport"));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("comando appeso oltre 15000ms"));
  });

  it("adb absent from the machine is an outcome with the reason written, not an exception (A-6)", async () => {
    const device = camera(endpoint);
    const adb = FakeAdb.make();
    adb.failOn("devices", { _tag: "SpawnFailed", detail: "adb: command not found" });
    const probe = AdbHealthProbe.make(config, { lookup: lookupOf(device), clock, spawn: adb.spawn });

    const outcome = await run(probe, FacetRef.make(device.id, "AdbTransport"));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("impossibile eseguire il comando: adb: command not found"));
  });

  it("una faccia che adb non osserva si dichiara tale invece di fingere un guasto", async () => {
    const device = camera(endpoint);
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    const probe = AdbHealthProbe.make(config, { lookup: lookupOf(device), clock, spawn: adb.spawn });

    const outcome = await run(probe, FacetRef.make(device.id, "StreamAvailable"));
    expect(outcome.detail).toEqual(O.some("faccia StreamAvailable non si osserva via adb: instradamento sbagliato"));
    expect(adb.commands()).toEqual([]);
  });
});
