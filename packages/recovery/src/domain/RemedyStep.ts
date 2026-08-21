// Un gradino della scala: un rimedio, la condizione che lo rende applicabile, quanto si aspetta
// l'esito del dispaccio, come si verifica la guarigione e quante volte si riprova.
// `appliesWhen` esiste per FL-1 step 1 e 4, dove un rimedio ha senso solo se il transport adb è
// giù (o solo se è su). Un gradino scartato **non** è un gradino fallito: non consuma tentativi,
// ma fa comunque avanzare l'indice (INV-4) e lascia la sua riga nel dossier — il dossier deve
// spiegare anche perché un rimedio non è stato provato.

import type { Duration } from "@lab/kernel/Duration";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import * as O from "fp-ts/Option";
import type { Remedy } from "./Remedy";
import type { RetryPolicy } from "./RetryPolicy";
import type { VerificationSpec } from "./VerificationSpec";

export type FacetCondition = {
  readonly facet: Facet;
  readonly is: "Healthy" | "Unhealthy";
};

export const when = (facet: Facet, is: "Healthy" | "Unhealthy"): FacetCondition => ({ facet, is });

export type RemedyStep = {
  readonly remedy: Remedy;
  readonly appliesWhen: O.Option<FacetCondition>;
  readonly dispatchTimeout: Duration;
  readonly verification: VerificationSpec;
  readonly retry: RetryPolicy;
};

export const make = (step: {
  readonly remedy: Remedy;
  readonly appliesWhen?: O.Option<FacetCondition>;
  readonly dispatchTimeout: Duration;
  readonly verification: VerificationSpec;
  readonly retry: RetryPolicy;
}): RemedyStep => ({ appliesWhen: O.none, ...step });

// La condizione si valuta sul device su cui si *agisce*, con la salute confermata che il
// contesto ha già portato: nessuna sonda, nessuna lettura fresca (§4.1).
export const applies = (step: RemedyStep, deviceId: DeviceId, health: HealthSnapshot.HealthSnapshot): boolean =>
  O.isNone(step.appliesWhen) ||
  (step.appliesWhen.value.is === "Healthy") ===
    HealthSnapshot.isHealthy(health, FacetRef.make(deviceId, step.appliesWhen.value.facet));
