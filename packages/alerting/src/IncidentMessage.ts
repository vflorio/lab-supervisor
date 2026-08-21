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
      `${String(target.unitId)} + ${target.dependents.length} dipendenti`;

const describeStatus = (status: HealthStatus, now: Instant.Instant): string => {
  switch (status._tag) {
    case "Unknown":
      return "mai osservata";
    case "Healthy":
      return `sana da ${humanize(Instant.between(status.since, now))}`;
    case "Unhealthy":
      return `giù da ${humanize(Instant.between(status.since, now))}`;
  }
};

const describeFacet = (health: FacetHealth, now: Instant.Instant): string =>
  `${String(health.ref.deviceId)} · ${health.ref.facet}: ${describeStatus(health.status, now)}`;

// Un gradino scartato non ha esito né dispaccio: dirlo com'è vale più di inventargli un esito
// (INV-4, INV-6).
const describeAttempt = (record: AttemptRecord): string => {
  const verdict = O.getOrElse(() => "in corso")(record.verdict);
  if (verdict === "Skipped") return `#${record.step} ${describeRemedy(record.remedy)} — scartato (precondizione falsa)`;
  const outcome = O.match(() => "nessuna risposta", RemedyOutcome.describe)(record.outcome);
  return `#${record.step} tentativo ${record.attempt} ${describeRemedy(record.remedy)} — ${outcome} → ${verdict}`;
};

const describeFailure = (failure: RemedyFailure): string =>
  `${describeRemedy(failure.remedy)}: ${RemedyOutcome.describe(failure.outcome)}`;

const describeReason = (incident: Incident): string =>
  O.match(
    // Nessuna resa: l'incidente è stato alzato subito per criticità, e i rimedi stanno ancora
    // girando (FATTO-16). Dirlo cambia cosa chi legge deve fare.
    () => "segnalato subito per criticità: il recupero è ancora in corso",
    (reason: { readonly _tag: string }) =>
      reason._tag === "RemedyUnsupported"
        ? "resa immediata: il device non dichiara la capability richiesta"
        : "scala di escalation esaurita",
  )(incident.reason);

export const render = (incident: Incident): ReadonlyArray<MessageBlock> => {
  const now = O.getOrElse(() => incident.raisedAt)(incident.closedAt);

  // Un incidente chiuso non è una nuova segnalazione: è la buona notizia, e va letta come tale.
  if (O.isSome(incident.closedAt))
    return [
      header(`✅ Rientrato · ${describeTarget(incident.target)}`),
      section(`Il guasto durava da ${humanize(Instant.between(incident.outageSince, now))} ed è rientrato.`),
      context(`sessione ${String(incident.sessionId)}`),
    ];

  const blocks: MessageBlock[] = [
    header(`🚨 ${describeTarget(incident.target)} non recuperato`),
    section([`Giù da ${humanize(Instant.between(incident.outageSince, now))}.`, describeReason(incident)].join(" ")),
  ];

  if (incident.facets.length > 0)
    blocks.push(
      section(["*Stato delle facce*", ...incident.facets.map((facet) => describeFacet(facet, now))].join("\n")),
    );

  if (incident.history.length > 0)
    blocks.push(section(["*Cosa è stato provato*", ...incident.history.map(describeAttempt)].join("\n")));

  if (incident.lastFailures.length > 0)
    blocks.push(section(["*Ultimo esito per rimedio*", ...incident.lastFailures.map(describeFailure)].join("\n")));

  blocks.push(
    context(
      `sessione ${String(incident.sessionId)} · criticità ${incident.criticality} · alzato ${Instant.toEpochMillis(incident.raisedAt)}`,
    ),
  );

  return blocks;
};

// La riga sola che deve bastare in una notifica di sistema, dove i blocchi non arrivano.
export const summary = (incident: Incident): string =>
  O.isSome(incident.closedAt)
    ? `Rientrato: ${describeTarget(incident.target)}`
    : `${describeTarget(incident.target)} non recuperato dopo ${incident.history.length} tentativi`;
