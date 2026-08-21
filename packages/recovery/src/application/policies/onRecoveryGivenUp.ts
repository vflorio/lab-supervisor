// La reazione a una resa: si alza l'`Incident` e lo si consegna. Non sa che Slack esiste, e non
// deve: riceve un `Incident` la porta, e la traduzione in blocchi è un adapter (M-7).
// È una reazione, cioè orchestrazione: application layer, mai dominio.

import type { Instant } from "@lab/kernel/Instant";
import type { HealthSnapshot } from "@lab/monitoring/domain/HealthSnapshot";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as Incident from "../../domain/Incident";
import type { RecoverySession } from "../../domain/RecoverySession";
import * as Notification from "../../ports/NotificationPort";

export type Env = Notification.NotificationEnv;

export const execute = (
  session: RecoverySession,
  health: HealthSnapshot,
  now: Instant,
): RTE.ReaderTaskEither<Env, Notification.NotifyFailed, Incident.Incident> => {
  const incident = Incident.raise({
    sessionId: session.id,
    target: session.target,
    criticality: session.rules.criticality,
    outageSince: session.outageSince,
    history: session.history,
    health,
    reason: session.phase._tag === "GivenUp" ? O.some(session.phase.reason) : O.none,
    at: now,
  });
  return pipe(
    Notification.publish(incident),
    RTE.map(() => incident),
  );
};
