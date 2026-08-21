// Il lab in miniatura, montato con i fake: una CU con quattro TV e tre camere che le inquadrano.
// Il test **è** l'adapter driving (§7). Nessuno di questi scenari tocca hardware, rete o
// l'orologio di sistema: il tempo è un `FakeClock` che si sposta a mano, ed è per questo che sei
// ore simulate passano in millisecondi.

import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as FakeClock from "@lab/kernel/testing/FakeClock";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as FacetHealth from "@lab/monitoring/domain/FacetHealth";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import * as InMemoryFacetHealthRepository from "@lab/monitoring/testing/InMemoryFacetHealthRepository";
import type * as Custody from "@lab/registry/domain/Custody";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as InMemoryDeviceRepository from "@lab/registry/testing/InMemoryDeviceRepository";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import * as onFacetBecameUnhealthy from "../../src/application/policies/onFacetBecameUnhealthy";
import * as TickDueSessions from "../../src/application/TickDueSessions";
import type { SupervisionProfile } from "../../src/domain/SupervisionProfile";
import * as InMemoryRecoverySessionRepository from "../../src/testing/InMemoryRecoverySessionRepository";
import * as InMemorySupervision from "../../src/testing/InMemorySupervision";
import * as InMemorySupervisionProfileRepository from "../../src/testing/InMemorySupervisionProfileRepository";
import * as RecordingNotifier from "../../src/testing/RecordingNotifier";
import * as ScriptedDeviceControl from "../../src/testing/ScriptedDeviceControl";
import * as SequentialSessionIds from "../../src/testing/SequentialSessionIds";
import { labProfiles } from "./labProfiles";

// Lunedì 12 gennaio 2026, ore 10:00 a Roma: dentro la finestra del lab.
export const START = Instant.fromEpochMillis(Date.UTC(2026, 0, 12, 9, 0, 0));

export const t = (seconds: number) => Instant.plus(START, Duration.seconds(seconds));

export const id = DeviceId.of;

const register = (draft: Device.Draft, parent?: Device.Device, relation?: "DependsOn" | "Observes") => {
  const created = Device.register(draft, START);
  if (E.isLeft(created)) throw new Error(created.left._tag);
  if (!parent || !relation) return created.right.state;
  const attached = Device.attach(created.right.state, parent, relation, START);
  if (E.isLeft(attached)) throw new Error(attached.left._tag);
  return attached.right.state;
};

export type LabOptions = {
  readonly controlUnitCapabilities?: Device.Draft["capabilities"];
  readonly profiles?: ReadonlyArray<SupervisionProfile>;
};

export const makeLab = (options: LabOptions = {}) => {
  const cu = register({
    id: id("cu-1"),
    kind: "ControlUnit",
    unitType: O.some("candybox"),
    capabilities: options.controlUnitCapabilities,
  });
  const tvs = ["tv-1", "tv-2", "tv-3", "tv-4"].map((name) => register({ id: id(name), kind: "Tv" }, cu, "DependsOn"));
  const cameras = ["cam-1", "cam-2", "cam-3"].map((name, index) =>
    register({ id: id(name), kind: "AndroidCamera" }, tvs[index] as Device.Device, "Observes"),
  );

  const clock = FakeClock.make(START);
  const deviceRepository = InMemoryDeviceRepository.make([cu, ...tvs, ...cameras]);
  const facetHealthRepository = InMemoryFacetHealthRepository.make();
  const supervisionProfileRepository = InMemorySupervisionProfileRepository.make(options.profiles ?? labProfiles);
  const recoverySessionRepository = InMemoryRecoverySessionRepository.make();
  const notification = RecordingNotifier.make();
  const ids = SequentialSessionIds.make();
  const deviceControl = ScriptedDeviceControl.make(
    clock.advance,
    (deviceId) => deviceRepository.all().find((device) => device.id === deviceId)?.capabilities,
  );
  const supervision = InMemorySupervision.make({
    devices: deviceRepository,
    health: facetHealthRepository,
    profiles: supervisionProfileRepository,
  });

  const env = {
    clock,
    deviceRepository,
    facetHealthRepository,
    supervisionProfileRepository,
    recoverySessionRepository,
    deviceControl,
    notification,
    ids,
    supervision,
  };

  const run = async <A>(action: ReaderTaskEither<typeof env, never, A>): Promise<A> => {
    const result = await action(env)();
    if (E.isLeft(result)) throw new Error("impossibile: il canale d'errore è never");
    return result.right;
  };

  // Scrive direttamente la salute **confermata**: gli scenari verificano il recupero, non
  // l'anti-flapping (che ha i suoi test in `@lab/monitoring`).
  const face = (deviceId: DeviceId.DeviceId, facet: Facet, state: "up" | "down", since: number) => {
    facetHealthRepository.put({
      ...FacetHealth.initial(FacetRef.make(deviceId, facet)),
      status: state === "up" ? HealthStatus.healthy(t(since)) : HealthStatus.unhealthy(t(since)),
    });
  };

  const hold = (deviceId: DeviceId.DeviceId, reason: string) => {
    const device = deviceRepository.all().find((candidate) => candidate.id === deviceId);
    if (device === undefined) throw new Error(`device sconosciuto: ${deviceId}`);
    return run(() => deviceRepository.save(Device.placeMaintenanceHold(device, reason, clock.read()).state));
  };

  const setCustody = (deviceId: DeviceId.DeviceId, custody: Custody.Custody) => {
    const device = deviceRepository.all().find((candidate) => candidate.id === deviceId);
    if (device === undefined) throw new Error(`device sconosciuto: ${deviceId}`);
    return run(() => deviceRepository.save({ ...device, custody }));
  };

  return {
    env,
    clock,
    cu,
    tvs,
    cameras,
    deviceControl,
    notification,
    sessions: () => recoverySessionRepository.all(),
    run,
    face,
    hold,
    setCustody,
    at: (seconds: number) => clock.set(t(seconds)),
    // La sonda ha visto cadere una faccia: si correla e si aprono i bersagli.
    detect: (facet: Facet) => run(onFacetBecameUnhealthy.execute(facet, clock.read())),
    tick: () => run(TickDueSessions.execute(clock.read())),
    // Sposta l'orologio e batte: due righe di scenario in una.
    until: (seconds: number) => {
      clock.set(t(seconds));
      return run(TickDueSessions.execute(clock.read()));
    },
    dispatched: () => deviceControl.dispatched(),
    incidents: () => notification.published(),
  };
};

export type Lab = ReturnType<typeof makeLab>;
