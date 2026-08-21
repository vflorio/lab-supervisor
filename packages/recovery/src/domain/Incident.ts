// L'output di business: la resa, con il dossier. Nasce da `RecoveryGivenUp`, oppure subito dopo
// `OutageConfirmed` se il profilo dichiara criticità immediata (FATTO-16).
// Porta con sé abbastanza diagnosi da evitare che qualcuno debba aprire i log: la cronologia dei
// tentativi con esiti e verdetti, la fotografia di **tutte** le facce di **tutti** i device
// coinvolti al momento della resa, e l'ultimo esito negativo riportato per ciascun rimedio.
// Al massimo un `IncidentRaised` per sessione; se era stato alzato in anticipo e la sessione poi
// si risolve, si emette `IncidentClosed`.
// Se in questo file comparisse la parola "Slack" il modello starebbe perdendo: la traduzione in
// blocchi è un adapter che osserva questo aggregato.

import type { DomainEvent } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import type { FacetHealth } from "@lab/monitoring/domain/FacetHealth";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import * as O from "fp-ts/Option";
import type { AttemptRecord } from "./AttemptRecord";
import type { GiveUpReason } from "./GiveUpReason";
import type { RecoverySessionId } from "./RecoverySessionId";
import * as RecoveryTarget from "./RecoveryTarget";
import type { Remedy } from "./Remedy";
import type { RemedyOutcome } from "./RemedyOutcome";
import type { Criticality } from "./SupervisionProfile";

export type RemedyFailure = {
  readonly remedy: Remedy;
  readonly outcome: RemedyOutcome;
  readonly at: Instant;
};

export type Incident = {
  readonly sessionId: RecoverySessionId;
  readonly target: RecoveryTarget.RecoveryTarget;
  readonly criticality: Criticality;
  readonly outageSince: Instant;
  readonly raisedAt: Instant;
  // Assente quando l'incidente è stato alzato in anticipo per criticità: non ci si è ancora arresi.
  readonly reason: O.Option<GiveUpReason>;
  readonly history: ReadonlyArray<AttemptRecord>;
  readonly facets: ReadonlyArray<FacetHealth>;
  readonly lastFailures: ReadonlyArray<RemedyFailure>;
  readonly closedAt: O.Option<Instant>;
};

export type IncidentRaised = DomainEvent<
  "IncidentRaised",
  { sessionId: RecoverySessionId; target: RecoveryTarget.RecoveryTarget; criticality: Criticality }
>;

export type IncidentClosed = DomainEvent<"IncidentClosed", { sessionId: RecoverySessionId }>;

export type IncidentEvent = IncidentRaised | IncidentClosed;

// L'ultimo esito negativo per ciascun rimedio: è ciò che in un messaggio di diagnosi risponde a
// "cosa ha detto l'hardware", senza costringere a leggere tutta la cronologia.
const lastFailuresOf = (history: ReadonlyArray<AttemptRecord>): ReadonlyArray<RemedyFailure> => {
  const byRemedy = new Map<string, RemedyFailure>();
  for (const record of history)
    if (O.isSome(record.outcome) && record.outcome.value._tag !== "Accepted")
      byRemedy.set(record.remedy._tag, {
        remedy: record.remedy,
        outcome: record.outcome.value,
        at: record.dispatchedAt,
      });
  return [...byRemedy.values()];
};

export const raise = (input: {
  readonly sessionId: RecoverySessionId;
  readonly target: RecoveryTarget.RecoveryTarget;
  readonly criticality: Criticality;
  readonly outageSince: Instant;
  readonly history: ReadonlyArray<AttemptRecord>;
  readonly health: HealthSnapshot.HealthSnapshot;
  readonly reason: O.Option<GiveUpReason>;
  readonly at: Instant;
}): Incident => ({
  sessionId: input.sessionId,
  target: input.target,
  criticality: input.criticality,
  outageSince: input.outageSince,
  raisedAt: input.at,
  reason: input.reason,
  history: input.history,
  // Tutte le facce di tutti i device coinvolti, non solo quella d'innesco: una camera con lo
  // stream giù e l'adb vivo racconta una storia diversa da una camera muta su entrambi (FATTO-8).
  facets: [...RecoveryTarget.members(input.target)].flatMap((deviceId) =>
    HealthSnapshot.facesOf(input.health, deviceId),
  ),
  lastFailures: lastFailuresOf(input.history),
  closedAt: O.none,
});

export const raised = (incident: Incident): IncidentRaised => ({
  _tag: "IncidentRaised",
  at: incident.raisedAt,
  sessionId: incident.sessionId,
  target: incident.target,
  criticality: incident.criticality,
});

export const close = (incident: Incident, at: Instant): Incident => ({ ...incident, closedAt: O.some(at) });

export const closed = (incident: Incident): IncidentClosed => ({
  _tag: "IncidentClosed",
  at: O.getOrElse(() => incident.raisedAt)(incident.closedAt),
  sessionId: incident.sessionId,
});

export const isOpen = (incident: Incident): boolean => O.isNone(incident.closedAt);
