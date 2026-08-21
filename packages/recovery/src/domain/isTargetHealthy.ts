// La **sola** funzione che decide se un bersaglio è sano (NO-2). La condividono tre domande che
// sembrano diverse e non lo sono:
//  - l'auto-guarigione prima di un comando (INV-7), con `notBefore` a `none`;
//  - la verifica di un rimedio (INV-5), con `notBefore` all'istante di dispaccio;
//  - il verdetto su un cluster (INV-8).
// Per un `Device`: la faccia è `Healthy` e, se c'è un `notBefore`, il suo `since` è **posteriore**
// a quell'istante. Uno stato sano ereditato da prima del comando non è una guarigione, è una
// lettura stantia (FATTO-13) — ed è il difetto che il modello deve rendere impossibile, non
// improbabile.
// Per un `ControlUnitCluster`: la CU è sana **e** la regola di correlazione non la incolpa più,
// contando i membri ancora giù. "La CU risponde al ping" non è mai, da solo, una guarigione.

import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as CorrelationRule from "./CorrelationRule";
import type { RecoveryTarget } from "./RecoveryTarget";

const isFacetHealthy = (
  deviceId: DeviceId,
  facet: Facet,
  health: HealthSnapshot.HealthSnapshot,
  notBefore: O.Option<Instant>,
): boolean => {
  const status = HealthSnapshot.statusOf(health, FacetRef.make(deviceId, facet));
  if (!HealthStatus.isHealthy(status)) return false;
  return pipe(
    notBefore,
    O.fold(
      () => true,
      (reference) =>
        pipe(
          HealthStatus.since(status),
          O.exists((since) => Instants.isAfter(since, reference)),
        ),
    ),
  );
};

export const isTargetHealthy = (
  target: RecoveryTarget,
  facet: Facet,
  rule: CorrelationRule.CorrelationRule,
  health: HealthSnapshot.HealthSnapshot,
  notBefore: O.Option<Instant>,
): boolean => {
  if (target._tag === "Device") return isFacetHealthy(target.deviceId, facet, health, notBefore);

  // La faccia è la stessa per la CU e per i dipendenti, perché `facetsOf` dà `Reachable` a
  // entrambi: non serve un secondo parametro per distinguerle.
  if (!isFacetHealthy(target.unitId, facet, health, notBefore)) return false;

  const stillDown = target.dependents.filter(
    (dependent) => !isFacetHealthy(dependent, facet, health, notBefore),
  ).length;

  return !CorrelationRule.blames(rule, stillDown, target.dependents.length);
};
