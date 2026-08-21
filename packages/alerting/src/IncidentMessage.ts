// La traduzione di un `Incident` in un messaggio leggibile. Vive qui e non nel dominio perché è una
// questione di presentazione: il dominio produce il dossier, non le parole per raccontarlo (M-7).
// Il criterio di riuscita è uno solo, ed è FATTO-16: chi legge non deve aprire i log. Quindi cosa è
// caduto e da quando, quali rimedi sono stati provati e con che esito, quali sono stati **scartati**
// e perché, e la fotografia di tutte le facce di tutti i device coinvolti — perché una camera con lo
// stream giù e l'adb vivo racconta una storia diversa da una camera muta su entrambi (FATTO-8).
// Nessuna parola di Slack qui dentro: `MessageBlock` è una forma neutra, e chi la veste è il
// notifier. Un `IncidentMessage` si legge bene anche in un terminale.

import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import type { FacetHealth } from "@lab/monitoring/domain/FacetHealth";
import type { HealthStatus } from "@lab/monitoring/domain/HealthStatus";
import type { AttemptRecord } from "@lab/recovery/domain/AttemptRecord";
import type { Incident, RemedyFailure } from "@lab/recovery/domain/Incident";
import type * as RecoveryTarget from "@lab/recovery/domain/RecoveryTarget";
import type { Remedy } from "@lab/recovery/domain/Remedy";
import * as RemedyOutcome from "@lab/recovery/domain/RemedyOutcome";
import * as O from "fp-ts/Option";

export type MessageBlock = { readonly kind: "header" | "section" | "context"; readonly text: string };

const header = (text: string): MessageBlock => ({ kind: "header", text });
const section = (text: string): MessageBlock => ({ kind: "section", text });
const context = (text: string): MessageBlock => ({ kind: "context", text });

// Una durata in parole. Chi legge alle tre di notte vuole "da 12 minuti", non un epoch.
const humanize = (duration: Duration.Duration): string => {
  const totalSeconds = Math.round(Duration.toMillis(duration) / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
};

const describeRemedy = (remedy: Remedy): string =>
  remedy._tag === "RestartApp" ? `RestartApp(${String(remedy.app)})` : remedy._tag;

const describeTarget = (target: RecoveryTarget.RecoveryTarget): string =>
  target._tag === "Device"
    ? String(target.deviceId)
    : // Per un cluster il bersaglio dell'azione è la CU, ma i coinvolti sono anche i figli: dirlo
      // evita la domanda "e le TV?" (FL-3).
      `${String(target.unitId)} + ${target.dependents.length} dependents`;

const describeStatus = (status: HealthStatus, now: Instant.Instant): string => {
  switch (status._tag) {
    case "Unknown":
      return "never observed";
    case "Healthy":
      return `healthy for ${humanize(Instant.between(status.since, now))}`;
    case "Unhealthy":
      return `down for ${humanize(Instant.between(status.since, now))}`;
  }
};

const describeFacet = (health: FacetHealth, now: Instant.Instant): string =>
  `${String(health.ref.deviceId)} · ${health.ref.facet}: ${describeStatus(health.status, now)}`;

// Un gradino scartato non ha esito né dispaccio: dirlo com'è vale più di inventargli un esito
// (INV-4, INV-6).
const describeAttempt = (record: AttemptRecord): string => {
  const verdict = O.getOrElse(() => "in progress")(record.verdict);
  if (verdict === "Skipped") return `#${record.step} ${describeRemedy(record.remedy)} — skipped (precondition false)`;
  const outcome = O.match(() => "no response", RemedyOutcome.describe)(record.outcome);
  return `#${record.step} attempt ${record.attempt} ${describeRemedy(record.remedy)} — ${outcome} → ${verdict}`;
};

const describeFailure = (failure: RemedyFailure): string =>
  `${describeRemedy(failure.remedy)}: ${RemedyOutcome.describe(failure.outcome)}`;

const describeReason = (incident: Incident): string =>
  O.match(
    // No surrender: the incident was raised immediately for criticality, and remedies are still
    // running (FACT-16). Saying it changes what the reader must do.
    () => "raised immediately for criticality: recovery is still in progress",
    (reason: { readonly _tag: string }) =>
      reason._tag === "RemedyUnsupported"
        ? "immediate surrender: device does not declare required capability"
        : "escalation ladder exhausted",
  )(incident.reason);

export const render = (incident: Incident): ReadonlyArray<MessageBlock> => {
  const now = O.getOrElse(() => incident.raisedAt)(incident.closedAt);

  // A closed incident is not a new alert: it is the good news, and must be read as such.
  if (O.isSome(incident.closedAt))
    return [
      header(`✅ Recovered · ${describeTarget(incident.target)}`),
      section(`The failure lasted ${humanize(Instant.between(incident.outageSince, now))} and has recovered.`),
      context(`session ${String(incident.sessionId)}`),
    ];

  const blocks: MessageBlock[] = [
    header(`🚨 ${describeTarget(incident.target)} not recovered`),
    section([`Down for ${humanize(Instant.between(incident.outageSince, now))}.`, describeReason(incident)].join(" ")),
  ];

  if (incident.facets.length > 0)
    blocks.push(
      section(["*Facet status*", ...incident.facets.map((facet) => describeFacet(facet, now))].join("\n")),
    );

  if (incident.history.length > 0)
    blocks.push(section(["*What was tried*", ...incident.history.map(describeAttempt)].join("\n")));

  if (incident.lastFailures.length > 0)
    blocks.push(section(["*Last outcome per remedy*", ...incident.lastFailures.map(describeFailure)].join("\n")));

  blocks.push(
    context(
      `session ${String(incident.sessionId)} · criticality ${incident.criticality} · raised ${Instant.toEpochMillis(incident.raisedAt)}`,
    ),
  );

  return blocks;
};

// La riga sola che deve bastare in una notifica di sistema, dove i blocchi non arrivano.
export const summary = (incident: Incident): string =>
  O.isSome(incident.closedAt)
    ? `Recovered: ${describeTarget(incident.target)}`
    : `${describeTarget(incident.target)} not recovered after ${incident.history.length} attempts`;
