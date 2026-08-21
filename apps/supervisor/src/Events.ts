// Come si leggono gli eventi di dominio in un log. Il modello pubblica fatti al passato; qui si
// traducono in una riga sola, perché un supervisore che gira per giorni si giudica dallo storico e
// non dallo stato istantaneo.
// Nessuna decisione qui dentro: se una riga di log dovesse *scegliere* qualcosa, sarebbe una policy
// nel posto sbagliato.

import type { MonitoringEvent } from "@lab/monitoring";
import type { RecoveryEvent } from "@lab/recovery";
import { type RecoveryTarget, type Remedy, RemedyOutcome } from "@lab/recovery";

const target = (value: RecoveryTarget.RecoveryTarget): string =>
  value._tag === "Device" ? String(value.deviceId) : `${String(value.unitId)}+${value.dependents.length}`;

const remedy = (value: Remedy.Remedy): string =>
  value._tag === "RestartApp" ? `RestartApp(${String(value.app)})` : value._tag;

export const describeMonitoring = (event: MonitoringEvent): string =>
  `${event._tag} ${String(event.deviceId)}/${event.facet} from ${new Date(event.since).toISOString()}`;

export const describeRecovery = (event: RecoveryEvent): string => {
  const head = `${event._tag} [${String(event.sessionId)}]`;
  switch (event._tag) {
    case "RecoverySessionOpened":
    case "OutageConfirmed":
      return `${head} ${target(event.target)} down since ${new Date(event.outageSince).toISOString()}`;
    case "RemedyDispatched":
      return `${head} ${target(event.target)} step ${event.step} attempt ${event.attempt}: ${remedy(event.remedy)}`;
    case "RemedyFailed":
      return `${head} step ${event.step} attempt ${event.attempt}: ${RemedyOutcome.describe(event.outcome)}`;
    case "RemedyTimedOut":
      return `${head} step ${event.step} attempt ${event.attempt}: no response from adapter`;
    case "StepSkipped":
      return `${head} step ${event.step} skipped (${remedy(event.remedy)}: needs ${event.condition.facet} ${event.condition.is})`;
    case "StepAdvanced":
      return `${head} step ${event.from} → ${event.to}`;
    case "VerificationSucceeded":
      return `${head} step ${event.step} attempt ${event.attempt}: ${event.facet} is back healthy`;
    case "VerificationTimedOut":
      return `${head} step ${event.step} attempt ${event.attempt}: ${event.facet} did not return in time`;
    case "RecoveryAttemptExhausted":
      return `${head} step ${event.step} exhausted after ${event.attempts} attempts`;
    case "DeviceRecovered":
      return `${head} ${target(event.target)} recovered`;
    case "RecoveryGivenUp":
      return `${head} ${target(event.target)} not recovered (${event.reason._tag}), nothing new before ${new Date(event.retryNotBefore).toISOString()}`;
    case "RecoverySessionAborted":
      return `${head} ${target(event.target)} aborted (${event.reason._tag})`;
  }
};
