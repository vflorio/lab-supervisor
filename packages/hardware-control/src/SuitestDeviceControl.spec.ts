import * as Instant from "@lab/kernel/Instant";
import * as Remedy from "@lab/recovery/domain/Remedy";
import * as Capability from "@lab/registry/domain/Capability";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as Endpoints from "@lab/registry/domain/Endpoints";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type { DeviceLookup } from "./DeviceLookup";
import * as SuitestDeviceControl from "./SuitestDeviceControl";
import * as FakeSuitest from "./testing/FakeSuitest";

const t0 = Instant.fromEpochMillis(1_000_000);

const config = {
  baseUrl: "https://the.suite.st/api/public/v4",
  tokenId: "id",
  tokenPassword: "secret",
  timeoutMs: 5_000,
};

const registered = (
  id: string,
  kind: Parameters<typeof Device.register>[0]["kind"],
  options: { readonly suitest?: string; readonly capabilities?: ReadonlySet<Capability.Capability> } = {},
) => {
  const decision = Device.register(
    {
      id: DeviceId.of(id),
      kind,
      unitType: kind === "ControlUnit" ? O.some("candybox" as const) : O.none,
      endpoints: Endpoints.make(options.suitest ? { suitest: O.some(Endpoints.suitestRef(options.suitest)) } : {}),
      capabilities: options.capabilities ?? Capability.capabilitiesOfKind(kind),
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

const run = async (
  port: ReturnType<typeof SuitestDeviceControl.make>,
  id: DeviceId.DeviceId,
  remedy: Remedy.Remedy,
) => {
  const result = await port.apply(id, remedy)();
  if (E.isLeft(result)) throw new Error("la porta non ha canale d'errore");
  return result.right;
};

describe("SuitestDeviceControl", () => {
  it("riavvia una control unit e risponde Accepted, non 'guarita' (INV-5)", async () => {
    const cu = registered("cu-1", "ControlUnit", { suitest: "candy-1" });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(cu), transport: suitest.transport });

    const outcome = await run(control, cu.id, Remedy.rebootHardware);

    expect(outcome).toEqual({ _tag: "Accepted" });
    expect(suitest.dispatched()).toEqual([{ unitId: "candy-1" }]);
  });

  it("una TV non si comanda da qui: la Public API non lo espone, il canale sarà lo smart plug (FATTO-10, NF-3)", async () => {
    const tv = registered("tv-1", "Tv", { suitest: "dev-1" });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(tv), transport: suitest.transport });

    expect(await run(control, tv.id, Remedy.powerOn)).toEqual({ _tag: "Unsupported" });
    expect(await run(control, tv.id, Remedy.rebootHardware)).toEqual({ _tag: "Unsupported" });
    expect(suitest.dispatched()).toEqual([]);
  });

  it("nemmeno una CU si accende: non esiste accensione fuori banda in questo giro (FL-2)", async () => {
    const cu = registered("cu-0", "ControlUnit", { suitest: "candy-0" });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(cu), transport: suitest.transport });

    expect(await run(control, cu.id, Remedy.powerOn)).toEqual({ _tag: "Unsupported" });
    expect(suitest.dispatched()).toEqual([]);
  });

  it("una CU che non dichiara RebootHardware è Unsupported, e nessun comando parte (FATTO-1, S9)", async () => {
    const cu = registered("cu-2", "ControlUnit", { suitest: "candy-2", capabilities: Capability.setOf("PowerOn") });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(cu), transport: suitest.transport });

    expect(await run(control, cu.id, Remedy.rebootHardware)).toEqual({ _tag: "Unsupported" });
    expect(suitest.dispatched()).toEqual([]);
  });

  it("un rimedio fuori dal mandato è Unsupported: chi altro possa farcela lo sa il routing (A-7)", async () => {
    const camera = registered("cam-1", "AndroidCamera", { suitest: "vcd-1" });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(camera), transport: suitest.transport });

    expect(await run(control, camera.id, Remedy.reconnectTransport)).toEqual({ _tag: "Unsupported" });
    expect(await run(control, camera.id, Remedy.relaunchSuite)).toEqual({ _tag: "Unsupported" });
    // Anche un rimedio che *sa* attuare, ma su un kind che non passa da Suitest.
    expect(await run(control, camera.id, Remedy.rebootHardware)).toEqual({ _tag: "Unsupported" });
    expect(suitest.dispatched()).toEqual([]);
  });

  it("un 404 è irraggiungibile, un altro 4xx è un rifiuto motivato", async () => {
    const cu = registered("cu-4", "ControlUnit", { suitest: "candy-4" });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(cu), transport: suitest.transport });

    suitest.breakWith({ _tag: "BadStatus", status: 404, body: "unknown control unit" });
    expect(await run(control, cu.id, Remedy.rebootHardware)).toEqual({ _tag: "Unreachable" });

    suitest.breakWith({ _tag: "BadStatus", status: 409, body: "unit in use" });
    expect(await run(control, cu.id, Remedy.rebootHardware)).toEqual({
      _tag: "Rejected",
      reason: "Suitest 409: unit in use",
    });
  });

  it("timeout e 5xx sono guasti del canale, non del device (FATTO-12)", async () => {
    const cu = registered("cu-5", "ControlUnit", { suitest: "candy-5" });
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(cu), transport: suitest.transport });

    suitest.breakWith({ _tag: "Timeout", afterMs: 5_000 });
    expect(await run(control, cu.id, Remedy.rebootHardware)).toEqual({
      _tag: "TransportError",
      detail: "nessuna risposta da Suitest entro 5000ms",
    });

    suitest.breakWith({ _tag: "BadStatus", status: 503, body: "" });
    expect(await run(control, cu.id, Remedy.rebootHardware)).toEqual({
      _tag: "TransportError",
      detail: "Suitest 503",
    });
  });

  it("un device che l'anagrafica non conosce lo dice con quelle parole", async () => {
    const suitest = FakeSuitest.make();
    const control = SuitestDeviceControl.make(config, { lookup: lookupOf(), transport: suitest.transport });

    expect(await run(control, DeviceId.of("fantasma"), Remedy.rebootHardware)).toEqual({
      _tag: "Rejected",
      reason: "device fantasma non presente in anagrafica",
    });
  });

  it("un dispaccio accettato invalida la fotografia: leggerla vecchia dichiarerebbe guarito un device che si spegne (FATTO-13)", async () => {
    const cu = registered("cu-3", "ControlUnit", { suitest: "candy-3" });
    const suitest = FakeSuitest.make();
    let invalidations = 0;
    const control = SuitestDeviceControl.make(config, {
      lookup: lookupOf(cu),
      transport: suitest.transport,
      onDispatched: () => {
        invalidations += 1;
      },
    });

    await run(control, cu.id, Remedy.rebootHardware);
    expect(invalidations).toBe(1);

    suitest.breakWith({ _tag: "Timeout", afterMs: 1 });
    await run(control, cu.id, Remedy.rebootHardware);
    // Un comando che non è partito non ha invecchiato niente.
    expect(invalidations).toBe(1);
  });
});
