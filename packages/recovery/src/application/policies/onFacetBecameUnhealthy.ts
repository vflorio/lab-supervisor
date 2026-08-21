// La reazione che innesca tutto: una faccia è caduta, quindi si guarda chi altro è giù su quella
// stessa faccia, si chiede alla parentela dove sia il guasto vero, e si aprono i bersagli.
// La correlazione si fa **per faccia**, ed è corretto: `Reachable` mette in relazione una CU con le
// sue TV, `StreamAvailable` riguarda solo le camere, e nessuna delle due dice niente dell'altra.
// `correlatable` è il filtro di INV-11: monitorati, supervisionati, senza custodia esterna. Un
// device che non lo è resta comunque nel conto dei guasti — altrimenti sparirebbe dai bersagli —
// ma non entra né al numeratore né al denominatore di una correlazione.

import type { Instant } from "@lab/kernel/Instant";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import * as FacetHealthRepository from "@lab/monitoring/ports/FacetHealthRepository";
import * as Custody from "@lab/registry/domain/Custody";
import type { Device } from "@lab/registry/domain/Device";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import * as DeviceKind from "@lab/registry/domain/DeviceKind";
import * as DeviceRepository from "@lab/registry/ports/DeviceRepository";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as CorrelationRule from "../../domain/CorrelationRule";
import { correlateOutage } from "../../domain/correlateOutage";
import * as Profiles from "../../ports/SupervisionProfileRepository";
import * as OpenRecoveryForConfirmedOutage from "../OpenRecoveryForConfirmedOutage";

export type Env = DeviceRepository.DeviceRepositoryEnv &
  FacetHealthRepository.FacetHealthRepositoryEnv &
  Profiles.SupervisionProfileRepositoryEnv &
  OpenRecoveryForConfirmedOutage.Env;

export type Output = ReadonlyArray<OpenRecoveryForConfirmedOutage.Result>;

const allDevices: RTE.ReaderTaskEither<DeviceRepository.DeviceRepositoryEnv, never, ReadonlyArray<Device>> = pipe(
  RTE.traverseArray(DeviceRepository.findByKind)(DeviceKind.all),
  RTE.map(RA.flatten),
);

// La regola di quorum vive sul profilo della CU, che è l'unico posto sensato: è una policy
// dell'hub (M-4). Senza profilo per la CU non c'è correlazione da fare, e `AllChildren` su un lab
// senza hub non incolpa nessuno.
const ruleInUse: RTE.ReaderTaskEither<
  Profiles.SupervisionProfileRepositoryEnv,
  never,
  CorrelationRule.CorrelationRule
> = pipe(
  Profiles.forKind("ControlUnit"),
  RTE.map(
    O.fold(
      () => CorrelationRule.allChildren,
      (profile) =>
        pipe(
          profile.correlation,
          O.map((correlation) => correlation.rule),
          O.getOrElse((): CorrelationRule.CorrelationRule => CorrelationRule.allChildren),
        ),
    ),
  ),
);

export const execute = (facet: Facet, now: Instant): RTE.ReaderTaskEither<Env, never, Output> =>
  pipe(
    RTE.Do,
    RTE.apSW("devices", allDevices),
    RTE.apSW("topology", DeviceRepository.topology()),
    RTE.apSW("unhealthy", FacetHealthRepository.allUnhealthy(facet)),
    RTE.apSW("rule", ruleInUse),
    RTE.flatMap(({ devices, topology, unhealthy, rule }) => {
      const monitored = new Map(devices.filter((device) => device.monitored).map((device) => [device.id, device]));

      const downSince = new Map<DeviceId, Instant>(
        unhealthy.flatMap((health) =>
          monitored.has(health.ref.deviceId)
            ? pipe(
                HealthStatus.since(health.status),
                O.map((since) => [[health.ref.deviceId, since]] as ReadonlyArray<readonly [DeviceId, Instant]>),
                O.getOrElse((): ReadonlyArray<readonly [DeviceId, Instant]> => []),
              )
            : [],
        ),
      );

      const correlatable = new Set(
        [...monitored.values()]
          .filter((device) => Custody.allowsSupervisor(device.custody, now))
          .map((device) => device.id),
      );

      return RTE.traverseArray((correlated: ReturnType<typeof correlateOutage>[number]) =>
        OpenRecoveryForConfirmedOutage.execute(correlated.target, correlated.outageSince, now),
      )(correlateOutage({ downSince, correlatable }, topology, rule));
    }),
  );
