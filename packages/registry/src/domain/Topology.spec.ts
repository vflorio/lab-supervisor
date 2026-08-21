import * as Instant from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Device from "./Device";
import * as DeviceId from "./DeviceId";
import * as Topology from "./Topology";

const t0 = Instant.fromEpochMillis(0);

const build = (draft: Device.Draft, parent?: Device.Device, relation?: "DependsOn" | "Observes"): Device.Device => {
  const created = Device.register(draft, t0);
  if (E.isLeft(created)) throw new Error(created.left._tag);
  if (!parent || !relation) return created.right.state;
  const attached = Device.attach(created.right.state, parent, relation, t0);
  if (E.isLeft(attached)) throw new Error(attached.left._tag);
  return attached.right.state;
};

const cu = build({ id: DeviceId.of("cu-1"), kind: "ControlUnit", unitType: O.some("candybox") });
const tvC = build({ id: DeviceId.of("tv-c"), kind: "Tv" }, cu, "DependsOn");
const tvA = build({ id: DeviceId.of("tv-a"), kind: "Tv" }, cu, "DependsOn");
const camera = build({ id: DeviceId.of("cam-1"), kind: "AndroidCamera" }, tvA, "Observes");
const topology = Topology.fromDevices([cu, tvC, tvA, camera]);

describe("Topology", () => {
  it("risale al genitore e scende ai figli per relazione", () => {
    expect(O.toNullable(Topology.parentOf(topology, tvA.id))?.parent).toBe(cu.id);
    expect(Topology.childrenOf(topology, tvA.id, "Observes")).toEqual([camera.id]);
  });

  it("i dipendenti di una CU sono le sue TV, mai le camere che le inquadrano (INV-11)", () => {
    expect(Topology.dependentsOf(topology, cu.id)).toEqual([tvA.id, tvC.id]);
    expect(Topology.dependentsOf(topology, tvA.id)).toEqual([]);
  });

  it("the order of children is deterministic, not the order of insertion", () => {
    const reversed = Topology.fromDevices([camera, tvA, tvC, cu]);
    expect(Topology.dependentsOf(reversed, cu.id)).toEqual(Topology.dependentsOf(topology, cu.id));
  });

  it("una CU non ha genitore", () => {
    expect(O.isNone(Topology.parentOf(topology, cu.id))).toBe(true);
  });
});
