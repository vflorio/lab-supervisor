import * as Duration from "@lab/kernel/Duration";
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
import type { DeviceLookup } from "./DeviceLookup";
import * as SuitestHealthProbe from "./SuitestHealthProbe";
import * as FakeSuitest from "./testing/FakeSuitest";

const t0 = Instant.fromEpochMillis(1_000_000);

const config = {
  baseUrl: "https://the.suite.st/api/public/v4",
  tokenId: "id",
  tokenPassword: "secret",
  timeoutMs: 5_000,
};

const registered = (id: string, kind: Parameters<typeof Device.register>[0]["kind"], suitest?: string) => {
  const draft = {
    id: DeviceId.of(id),
    kind,
    unitType: kind === "ControlUnit" ? O.some("candybox" as const) : O.none,
    endpoints: Endpoints.make(suitest ? { suitest: O.some(Endpoints.suitestRef(suitest)) } : {}),
    capabilities: Capability.capabilitiesOfKind(kind),
  };
  const decision = Device.register(draft, t0);
  if (E.isLeft(decision)) throw new Error("fixture non valida");
  return decision.right.state;
};

const lookupOf = (...devices: ReadonlyArray<Device.Device>): DeviceLookup => {
  const byId = new Map(devices.map((device) => [String(device.id), device]));
  return (id) => TE.right(O.fromNullable(byId.get(String(id))));
};

// Un orologio che non avanza da solo: ogni test decide se il mirror è scaduto o no.
const frozenClock = (start = t0) => {
  let now = start;
  return {
    clock: { now: () => now },
    advance: (by: Duration.Duration) => {
      now = Instant.plus(now, by);
    },
  };
};

const run = async (port: ReturnType<typeof SuitestHealthProbe.make>, ref: FacetRef.FacetRef) => {
  const result = await port.probe(ref)();
  if (E.isLeft(result)) throw new Error("la porta non ha canale d'errore");
  return result.right;
};

describe("SuitestHealthProbe", () => {
  it("reads `online` for units as Reachable facet of a control unit (FACT-6)", async () => {
    const cu = registered("cu-1", "ControlUnit", "candy-1");
    const suitest = FakeSuitest.make({
      ...FakeSuitest.emptyLab,
      controlUnits: [FakeSuitest.controlUnit("candy-1", { online: false })],
    });
    const { clock } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(cu),
      clock,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    const outcome = await run(probe, FacetRef.make(cu.id, "Reachable"));

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("online=false"));
  });

  it("legge lo `status` del device come faccia Reachable di una TV (FATTO-7)", async () => {
    const tv = registered("tv-1", "Tv", "dev-1");
    const suitest = FakeSuitest.make({
      ...FakeSuitest.emptyLab,
      devices: [FakeSuitest.device("dev-1", { status: "TESTING" })],
    });
    const { clock } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(tv),
      clock,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    // Occupatissima e viva: `TESTING` sta comunicando con Suitest, non è un guasto.
    expect((await run(probe, FacetRef.make(tv.id, "Reachable"))).ok).toBe(true);

    suitest.setLab({ ...FakeSuitest.emptyLab, devices: [FakeSuitest.device("dev-1", { status: "CANNOT_TURN_ON" })] });
    const { clock: later } = frozenClock(Instant.plus(t0, Duration.minutes(1)));
    const fresh = SuitestHealthProbe.make(config, {
      lookup: lookupOf(tv),
      clock: later,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    const outcome = await run(fresh, FacetRef.make(tv.id, "Reachable"));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("status Suitest: CANNOT_TURN_ON"));
  });

  it("StreamAvailable pretende `online` e `streamActive` insieme (FATTO-8)", async () => {
    const camera = registered("cam-1", "AndroidCamera", "vcd-1");
    const suitest = FakeSuitest.make({
      ...FakeSuitest.emptyLab,
      videoCaptureDevices: [FakeSuitest.videoCaptureDevice("vcd-1", { online: false, streamActive: true })],
    });
    const { clock } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(camera),
      clock,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    const outcome = await run(probe, FacetRef.make(camera.id, "StreamAvailable"));

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("online=false, streamActive=true"));
  });

  it("a camera without Suitest reference is an outcome, not an exception (FACT-9)", async () => {
    const camera = registered("cam-2", "AndroidCamera");
    const suitest = FakeSuitest.make();
    const { clock } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(camera),
      clock,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    const outcome = await run(probe, FacetRef.make(camera.id, "StreamAvailable"));

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("nessun riferimento Suitest per questo device"));
    // Nessuna chiamata: senza chiave esterna non c'è niente da chiedere.
    expect(suitest.reads()).toEqual([]);
  });

  it("un guasto del canale diventa un esito con la ragione scritta, mai un errore (A-6)", async () => {
    const cu = registered("cu-3", "ControlUnit", "candy-3");
    const suitest = FakeSuitest.make();
    suitest.breakWith({ _tag: "Timeout", afterMs: 5_000 });
    const { clock } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(cu),
      clock,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    const outcome = await run(probe, FacetRef.make(cu.id, "Reachable"));

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("nessuna risposta entro 5000ms"));
  });

  it("multiple facets in the same tick share a single Suitest read", async () => {
    const cu = registered("cu-4", "ControlUnit", "candy-4");
    const tv = registered("tv-4", "Tv", "dev-4");
    const camera = registered("cam-4", "AndroidCamera", "vcd-4");
    const suitest = FakeSuitest.make({
      devices: [FakeSuitest.device("dev-4")],
      controlUnits: [FakeSuitest.controlUnit("candy-4")],
      videoCaptureDevices: [FakeSuitest.videoCaptureDevice("vcd-4")],
    });
    const { clock, advance } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(cu, tv, camera),
      clock,
      snapshotTtl: Duration.seconds(30),
      transport: suitest.transport,
    });

    const outcomes = await Promise.all([
      run(probe, FacetRef.make(cu.id, "Reachable")),
      run(probe, FacetRef.make(tv.id, "Reachable")),
      run(probe, FacetRef.make(camera.id, "StreamAvailable")),
    ]);

    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    // Tre endpoint, non nove: il mirror esiste per questo.
    expect(suitest.reads()).toHaveLength(3);

    // Scaduta la finestra si rilegge, altrimenti l'anti-flapping conterebbe due volte la stessa
    // osservazione.
    advance(Duration.seconds(31));
    await run(probe, FacetRef.make(cu.id, "Reachable"));
    expect(suitest.reads()).toHaveLength(6);
  });

  it("the outcome's instant is that of the snapshot, not of the query", async () => {
    const cu = registered("cu-5", "ControlUnit", "candy-5");
    const suitest = FakeSuitest.make({
      ...FakeSuitest.emptyLab,
      controlUnits: [FakeSuitest.controlUnit("candy-5")],
    });
    const { clock, advance } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(cu),
      clock,
      snapshotTtl: Duration.minutes(10),
      transport: suitest.transport,
    });

    await run(probe, FacetRef.make(cu.id, "Reachable"));
    advance(Duration.minutes(2));
    const outcome = await run(probe, FacetRef.make(cu.id, "Reachable"));

    expect(outcome.at).toEqual(t0);
  });

  it("una faccia che Suitest non osserva si dichiara tale invece di fingere un guasto", async () => {
    const camera = registered("cam-6", "AndroidCamera", "vcd-6");
    const suitest = FakeSuitest.make({
      ...FakeSuitest.emptyLab,
      videoCaptureDevices: [FakeSuitest.videoCaptureDevice("vcd-6")],
    });
    const { clock } = frozenClock();
    const probe = SuitestHealthProbe.make(config, {
      lookup: lookupOf(camera),
      clock,
      snapshotTtl: Duration.seconds(5),
      transport: suitest.transport,
    });

    const outcome = await run(probe, FacetRef.make(camera.id, "AdbTransport"));

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toEqual(O.some("AdbTransport non si osserva via Suitest: instradamento sbagliato"));
  });
});
