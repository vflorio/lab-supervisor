import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as FakeClock from "@lab/kernel/testing/FakeClock";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as InMemoryDeviceRepository from "@lab/registry/testing/InMemoryDeviceRepository";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as FacetRef from "../domain/FacetRef";
import * as FlappingPolicy from "../domain/FlappingPolicy";
import * as HealthStatus from "../domain/HealthStatus";
import * as InMemoryFacetHealthRepository from "../testing/InMemoryFacetHealthRepository";
import * as ScriptedHealthProbe from "../testing/ScriptedHealthProbe";
import * as ProbeMonitoredFacets from "./ProbeMonitoredFacets";

const START = Instant.fromEpochMillis(0);
const cu = DeviceId.of("cu-1");
const camera = DeviceId.of("cam-1");

const register = (id: DeviceId.DeviceId, kind: Device.Draft["kind"], unitType?: "candybox") => {
  const created = Device.register({ id, kind, unitType: O.fromNullable(unitType) }, START);
  if (E.isLeft(created)) throw new Error(created.left._tag);
  return created.right.state;
};

const keysOf = (refs: ReadonlyArray<FacetRef.FacetRef>) => [...refs.map(FacetRef.key)].sort();

const makeLab = (
  devices: ReadonlyArray<Device.Device>,
  answers: ReadonlyArray<readonly [FacetRef.FacetRef, boolean]> = [],
) => {
  const clock = FakeClock.make(START);
  const facetHealthRepository = InMemoryFacetHealthRepository.make();
  const healthProbe = ScriptedHealthProbe.make(clock.read, answers);
  const env = {
    deviceRepository: InMemoryDeviceRepository.make(devices),
    facetHealthRepository,
    healthProbe,
  };

  return {
    clock,
    healthProbe,
    facetHealthRepository,
    sweep: async (policy = FlappingPolicy.immediate) => {
      const result = await ProbeMonitoredFacets.execute(policy)(env)();
      if (E.isLeft(result)) throw new Error("impossibile: il canale d'errore è never");
      return result.right;
    },
  };
};

describe("ProbeMonitoredFacets", () => {
  it("espande ogni device nelle facce del suo kind (FATTO-8)", async () => {
    const lab = makeLab([register(cu, "ControlUnit", "candybox"), register(camera, "AndroidCamera")]);
    await lab.sweep();
    expect(keysOf(lab.healthProbe.probed())).toEqual(
      keysOf([
        FacetRef.make(cu, "Reachable"),
        FacetRef.make(camera, "AdbTransport"),
        FacetRef.make(camera, "StreamAvailable"),
      ]),
    );
  });

  it("un device non monitorato o ritirato non si sonda affatto (INV-11)", async () => {
    const retired = Device.retire(register(camera, "AndroidCamera"), START).state;
    const lab = makeLab([register(cu, "ControlUnit", "candybox"), retired]);
    await lab.sweep();
    expect(keysOf(lab.healthProbe.probed())).toEqual(keysOf([FacetRef.make(cu, "Reachable")]));
  });

  it("a maintenance hold does not remove the device from sight: watching is not commanding", async () => {
    const held = Device.placeMaintenanceHold(register(cu, "ControlUnit", "candybox"), "manutenzione", START).state;
    const lab = makeLab([held]);
    await lab.sweep();
    expect(keysOf(lab.healthProbe.probed())).toEqual(keysOf([FacetRef.make(cu, "Reachable")]));
  });

  it("gli esiti passano dall'anti-flapping prima di diventare fatti", async () => {
    const reachable = FacetRef.make(cu, "Reachable");
    const lab = makeLab([register(cu, "ControlUnit", "candybox")], [[reachable, false]]);
    const prudent = FlappingPolicy.make(2, 1);

    const first = await lab.sweep(prudent);
    expect(first.events).toEqual([]);

    lab.clock.advance(Duration.seconds(30));
    const second = await lab.sweep(prudent);
    expect(second.events).toEqual([
      {
        _tag: "FacetBecameUnhealthy",
        at: Instant.plus(START, Duration.seconds(30)),
        deviceId: cu,
        facet: "Reachable",
        since: START,
      },
    ]);
    expect(await lab.facetHealthRepository.statusOf(reachable)()).toEqual(E.right(HealthStatus.unhealthy(START)));
  });

  it("un lab senza device monitorati non sonda nulla e non pubblica niente", async () => {
    const lab = makeLab([Device.retire(register(cu, "ControlUnit", "candybox"), START).state]);
    const output = await lab.sweep();
    expect(lab.healthProbe.probed()).toEqual([]);
    expect(output).toEqual({ healths: [], events: [] });
  });
});
