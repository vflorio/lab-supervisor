// INV-12, la metà che nessun aggregato può vedere: quanti figli ha già quella CU.

import * as Instant from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Device from "../domain/Device";
import * as DeviceId from "../domain/DeviceId";
import * as InMemoryDeviceRepository from "../testing/InMemoryDeviceRepository";
import * as AttachDevice from "./AttachDevice";

const t0 = Instant.fromEpochMillis(0);

const build = (draft: Device.Draft, parent?: Device.Device): Device.Device => {
  const created = Device.register(draft, t0);
  if (E.isLeft(created)) throw new Error(created.left._tag);
  if (!parent) return created.right.state;
  const attached = Device.attach(created.right.state, parent, "DependsOn", t0);
  if (E.isLeft(attached)) throw new Error(attached.left._tag);
  return attached.right.state;
};

const cu = build({ id: DeviceId.of("cu-1"), kind: "ControlUnit", unitType: O.some("candybox") });
const fourTvs = ["tv-1", "tv-2", "tv-3", "tv-4"].map((id) => build({ id: DeviceId.of(id), kind: "Tv" }, cu));

const run = (seed: ReadonlyArray<Device.Device>, input: AttachDevice.Input) => {
  const deviceRepository = InMemoryDeviceRepository.make(seed);
  return AttachDevice.execute(input, t0)({ deviceRepository })();
};

describe("AttachDevice", () => {
  it("a fifth TV on the same CU is an impossible topology (FACT-2)", async () => {
    const fifth = build({ id: DeviceId.of("tv-5"), kind: "Tv" });
    const result = await run([cu, ...fourTvs, fifth], {
      deviceId: fifth.id,
      parent: cu.id,
      relation: "DependsOn",
    });
    expect(E.isLeft(result) && result.left._tag).toBe("TooManyDependents");
  });

  it("reattaching a TV already attached to the same CU is allowed: it is not a fifth child", async () => {
    const result = await run([cu, ...fourTvs], {
      deviceId: fourTvs[0]!.id,
      parent: cu.id,
      relation: "DependsOn",
    });
    expect(E.isRight(result)).toBe(true);
  });

  it("una camera non si attacca DependsOn a una CU (FATTO-3, NF-2)", async () => {
    const camera = build({ id: DeviceId.of("cam-1"), kind: "AndroidCamera" });
    const result = await run([cu, camera], { deviceId: camera.id, parent: cu.id, relation: "DependsOn" });
    expect(E.isLeft(result) && result.left._tag).toBe("InvalidAttachment");
  });

  it("attaching to a nonexistent device is a domain error, not a crash", async () => {
    const tv = build({ id: DeviceId.of("tv-9"), kind: "Tv" });
    const result = await run([tv], { deviceId: tv.id, parent: DeviceId.of("cu-ignoto"), relation: "DependsOn" });
    expect(E.isLeft(result) && result.left._tag).toBe("DeviceNotFound");
  });

  it("successful attachment is persisted and publishes the fact", async () => {
    const tv = build({ id: DeviceId.of("tv-6"), kind: "Tv" });
    const deviceRepository = InMemoryDeviceRepository.make([cu, tv]);
    const result = await AttachDevice.execute(
      { deviceId: tv.id, parent: cu.id, relation: "DependsOn" },
      t0,
    )({
      deviceRepository,
    })();
    expect(E.isRight(result) && result.right.events.map((event) => event._tag)).toEqual(["DeviceAttached"]);
    const saved = deviceRepository.all().find((device) => device.id === tv.id);
    expect(saved && O.isSome(saved.attachment)).toBe(true);
  });
});
