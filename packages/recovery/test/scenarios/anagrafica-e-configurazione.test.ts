// L'anagrafica che rifiuta le topologie impossibili, la proprietà della correlazione e le regole
// congelate. Scenari S20–S22.

import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as AttachDevice from "@lab/registry/application/AttachDevice";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as Topology from "@lab/registry/domain/Topology";
import * as InMemoryDeviceRepository from "@lab/registry/testing/InMemoryDeviceRepository";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as ConfigureSupervisionProfile from "../../src/application/ConfigureSupervisionProfile";
import * as CorrelationRule from "../../src/domain/CorrelationRule";
import { correlateOutage } from "../../src/domain/correlateOutage";
import * as Playbook from "../../src/domain/Playbook";
import * as RecoveryTarget from "../../src/domain/RecoveryTarget";
import * as Remedy from "../../src/domain/Remedy";
import * as RemedyStep from "../../src/domain/RemedyStep";
import * as RetryPolicy from "../../src/domain/RetryPolicy";
import * as VerificationSpec from "../../src/domain/VerificationSpec";
import { makeLab, START, t } from "../fixtures/lab";
import { cameraProfile } from "../fixtures/labProfiles";

describe("S20 · l'anagrafica non accetta topologie impossibili (INV-12)", () => {
  const build = (draft: Device.Draft, parent?: Device.Device) => {
    const created = Device.register(draft, START);
    if (E.isLeft(created)) throw new Error(created.left._tag);
    if (!parent) return created.right.state;
    const attached = Device.attach(created.right.state, parent, "DependsOn", START);
    if (E.isLeft(attached)) throw new Error(attached.left._tag);
    return attached.right.state;
  };

  const cu = build({ id: DeviceId.of("cu-1"), kind: "ControlUnit", unitType: O.some("candybox") });
  const fourTvs = ["tv-1", "tv-2", "tv-3", "tv-4"].map((name) => build({ id: DeviceId.of(name), kind: "Tv" }, cu));

  const attach = (seed: ReadonlyArray<Device.Device>, input: AttachDevice.Input) =>
    AttachDevice.execute(input, START)({ deviceRepository: InMemoryDeviceRepository.make(seed) })();

  it("a fifth TV on the same CU is a domain error (FACT-2)", async () => {
    const fifth = build({ id: DeviceId.of("tv-5"), kind: "Tv" });
    const result = await attach([cu, ...fourTvs, fifth], {
      deviceId: fifth.id,
      parent: cu.id,
      relation: "DependsOn",
    });
    expect(E.isLeft(result) && result.left._tag).toBe("TooManyDependents");
  });

  it("a camera attached DependsOn to a CU is a domain error (FACT-3)", async () => {
    const camera = build({ id: DeviceId.of("cam-1"), kind: "AndroidCamera" });
    const result = await attach([cu, camera], { deviceId: camera.id, parent: cu.id, relation: "DependsOn" });
    expect(E.isLeft(result) && result.left._tag).toBe("InvalidAttachment");
  });
});

describe("S21 · correlateOutage properties (M-5)", () => {
  it("on any set of down devices the targets are disjoint and account for all", () => {
    const lab = makeLab();
    const devices = [lab.cu, ...lab.tvs, ...lab.cameras];
    const topology = Topology.fromDevices(devices);

    for (let mask = 0; mask < 2 ** devices.length; mask++) {
      const down = devices.filter((_, index) => (mask >> index) & 1);
      const result = correlateOutage(
        {
          downSince: new Map(down.map((device) => [device.id, t(0)])),
          correlatable: new Set(devices.map((device) => device.id)),
        },
        topology,
        CorrelationRule.allChildren,
      );

      const covered = result.flatMap((entry) => [...RecoveryTarget.members(entry.target)]);
      expect(new Set(covered).size, `maschera ${mask}`).toBe(covered.length);
      const downIds = new Set(down.map((device) => device.id));
      expect(covered.filter((id) => downIds.has(id)).sort(), `maschera ${mask}`).toEqual([...downIds].sort());
    }
  });
});

describe("S22 · le regole congelate e quelle vive (INV-13)", () => {
  it("changing the profile does not alter an already open session", async () => {
    const lab = makeLab();
    const camera = lab.cameras[0]!;
    lab.face(camera.id, "StreamAvailable", "down", 0);
    lab.face(camera.id, "AdbTransport", "down", 0);
    await lab.detect("StreamAvailable");

    // Un profilo nuovo, con un solo gradino e un rimedio diverso.
    const replacement = {
      ...cameraProfile,
      playbook: (() => {
        const built = Playbook.make(
          [
            RemedyStep.make({
              remedy: Remedy.relaunchSuite,
              dispatchTimeout: Duration.seconds(30),
              verification: VerificationSpec.make(
                "StreamAvailable",
                Duration.seconds(5),
                Duration.seconds(5),
                Duration.seconds(30),
              ),
              retry: RetryPolicy.make(1, RetryPolicy.fixed(Duration.seconds(10))),
            }),
          ],
          "StreamAvailable",
        );
        if (E.isLeft(built)) throw new Error(built.left._tag);
        return built.right;
      })(),
    };
    const saved = await ConfigureSupervisionProfile.execute(replacement)(lab.env)();
    expect(E.isRight(saved)).toBe(true);

    await lab.until(180);

    // La sessione percorre ancora la scala con cui è nata: primo gradino `ReconnectTransport`.
    expect(lab.dispatched().map((call) => call.remedy._tag)).toEqual(["ReconnectTransport"]);
    expect(lab.sessions()[0]?.rules.playbook.steps).toHaveLength(4);
  });

  it("chiudere la finestra invece ha effetto immediato", async () => {
    const lab = makeLab();
    const camera = lab.cameras[0]!;
    lab.face(camera.id, "StreamAvailable", "down", 0);
    lab.face(camera.id, "AdbTransport", "up", 0);
    await lab.detect("StreamAvailable");
    await lab.until(180);
    expect(lab.sessions()[0]?.phase._tag).toBe("Verifying");

    // La finestra è live: si rilegge dal contesto a ogni tick, e questa non autorizza più nulla.
    const narrowed = { ...cameraProfile, window: { ...cameraProfile.window, days: [] } };
    await ConfigureSupervisionProfile.execute(narrowed)(lab.env)();
    lab.clock.set(Instant.plus(START, Duration.seconds(200)));
    await lab.tick();

    expect(lab.sessions()[0]?.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "OutOfWindow" } });
  });
});
