import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as FacetHealth from "@lab/monitoring/domain/FacetHealth";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import * as InMemoryFacetHealthRepository from "@lab/monitoring/testing/InMemoryFacetHealthRepository";
import * as Capability from "@lab/registry/domain/Capability";
import * as Custody from "@lab/registry/domain/Custody";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import * as InMemoryDeviceRepository from "@lab/registry/testing/InMemoryDeviceRepository";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Playbook from "../domain/Playbook";
import * as RecoveryTarget from "../domain/RecoveryTarget";
import * as Remedy from "../domain/Remedy";
import * as RemedyStep from "../domain/RemedyStep";
import * as RetryPolicy from "../domain/RetryPolicy";
import * as SupervisionProfile from "../domain/SupervisionProfile";
import * as SupervisionWindow from "../domain/SupervisionWindow";
import * as VerificationSpec from "../domain/VerificationSpec";
import * as InMemorySupervisionProfileRepository from "../testing/InMemorySupervisionProfileRepository";
import * as ComposedSupervision from "./ComposedSupervision";

const unwrap = <A>(either: E.Either<{ readonly _tag: string }, A>): A => {
  if (E.isLeft(either)) throw new Error(either.left._tag);
  return either.right;
};

const window = SupervisionWindow.always;

// Un profilo minimo: quello che serve qui è che esista e porti la sua finestra, non la scala
// vera del lab (quella vive nelle fixture degli scenari).
const profileFor = (kind: DeviceKind, facet: "Reachable" | "StreamAvailable") =>
  unwrap(
    SupervisionProfile.make(
      {
        kind,
        trigger: facet,
        gracePeriod: Duration.minutes(1),
        playbook: unwrap(
          Playbook.make(
            [
              RemedyStep.make({
                remedy: Remedy.rebootHardware,
                dispatchTimeout: Duration.seconds(30),
                verification: VerificationSpec.make(
                  facet,
                  Duration.seconds(30),
                  Duration.seconds(15),
                  Duration.minutes(2),
                ),
                retry: RetryPolicy.make(1, RetryPolicy.fixed(Duration.seconds(30))),
              }),
            ],
            facet,
          ),
        ),
        criticality: "NotifyWhenExhausted",
        cooldownAfterGiveUp: Duration.minutes(30),
        window,
        correlation: O.none,
      },
      Capability.capabilitiesOfKind(kind),
    ),
  );

const cameraProfile = profileFor("AndroidCamera", "StreamAvailable");
const controlUnitProfile = profileFor("ControlUnit", "Reachable");

const at = Instant.fromEpochMillis(0);
const cu = DeviceId.of("cu-1");
const tv = DeviceId.of("tv-1");
const camera = DeviceId.of("cam-1");

const register = (id: DeviceId.DeviceId, kind: Device.Draft["kind"], unitType?: "candybox") => {
  const created = Device.register({ id, kind, unitType: O.fromNullable(unitType) }, at);
  if (E.isLeft(created)) throw new Error(created.left._tag);
  return created.right.state;
};

const make = (devices: ReadonlyArray<Device.Device>, profiles = [cameraProfile, controlUnitProfile]) => {
  const health = InMemoryFacetHealthRepository.make();
  const deviceRepository = InMemoryDeviceRepository.make(devices);
  return {
    health,
    deviceRepository,
    supervision: ComposedSupervision.make({
      devices: deviceRepository,
      health,
      profiles: InMemorySupervisionProfileRepository.make(profiles),
    }),
  };
};

const run = async <A>(task: () => Promise<E.Either<never, A>>): Promise<A> => {
  const result = await task();
  if (E.isLeft(result)) throw new Error("impossibile: il canale d'errore è never");
  return result.right;
};

describe("ComposedSupervision", () => {
  it("il profilo di un cluster è quello del device su cui si agisce, la CU", async () => {
    const { supervision } = make([register(cu, "ControlUnit", "candybox"), register(tv, "Tv")]);
    const profile = await run(supervision.profileFor(RecoveryTarget.controlUnitCluster(cu, [tv])));
    expect(profile).toEqual(O.some(controlUnitProfile));
  });

  it("un kind senza profilo non ha finestra: nessuna autorizzazione per inerzia (NF-1)", async () => {
    const { supervision } = make([register(tv, "Tv")]);
    const context = await run(supervision.contextFor(RecoveryTarget.device(tv)));
    expect(await run(supervision.profileFor(RecoveryTarget.device(tv)))).toEqual(O.none);
    expect(context.window).toEqual(SupervisionWindow.closed);
  });

  it("finestra dal profilo e custodia dall'anagrafica, rilette a ogni chiamata (INV-13)", async () => {
    const device = register(camera, "AndroidCamera");
    const { supervision, deviceRepository } = make([device]);
    const target = RecoveryTarget.device(camera);

    const before = await run(supervision.contextFor(target));
    expect(before.window).toEqual(window);
    expect(before.custody).toEqual(Custody.supervisor);

    await run(deviceRepository.save(Device.placeMaintenanceHold(device, "manutenzione", at).state));

    const after = await run(supervision.contextFor(target));
    expect(after.custody).toEqual(Custody.operator("manutenzione", at));
  });

  it("la fotografia porta le facce dei soli membri del bersaglio", async () => {
    const { supervision, health } = make([register(camera, "AndroidCamera"), register(tv, "Tv")]);
    const stream = FacetRef.make(camera, "StreamAvailable");
    health.put({ ...FacetHealth.initial(stream), status: HealthStatus.unhealthy(at) });
    health.put({ ...FacetHealth.initial(FacetRef.make(tv, "Reachable")), status: HealthStatus.healthy(at) });

    const context = await run(supervision.contextFor(RecoveryTarget.device(camera)));
    expect(HealthSnapshot.statusOf(context.health, stream)).toEqual(HealthStatus.unhealthy(at));
    expect(HealthSnapshot.facesOf(context.health, tv)).toEqual([]);
  });

  it("un device sconosciuto all'anagrafica non porta salute con sé", async () => {
    const { supervision, health } = make([]);
    health.put({ ...FacetHealth.initial(FacetRef.make(camera, "StreamAvailable")), status: HealthStatus.healthy(at) });
    const context = await run(supervision.contextFor(RecoveryTarget.device(camera)));
    expect(context.health).toEqual(HealthSnapshot.empty);
  });
});
