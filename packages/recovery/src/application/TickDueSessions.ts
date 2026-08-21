// Il battito. Carica le sessioni dovute, per ciascuna risolve il contesto e guida il ciclo
// `comando → decide → eventi → effetti → comando` fino a punto fisso, con un `fuel` esplicito
// perché una macchina a stati che si riprogramma da sola deve avere un fondo.
// Due tempi, e sono cose diverse: il **ticker** (ogni N secondi) è un adapter driving e sta fuori
// da questo package; il **clock** è una porta che questo caso d'uso interroga dopo ogni effetto,
// perché un adapter può metterci un tempo arbitrario (FATTO-12) e l'esito che torna va datato a
// quando è tornato davvero — è così che una risposta tardiva diventa `RemedyTimedOut` (INV-10).
// Le sessioni sono indipendenti: si attraversano in parallelo, così un adapter lento non ferma
// il batch.

import * as Clock from "@lab/kernel/Clock";
import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as Incident from "../domain/Incident";
import type { RecoveryEvent } from "../domain/RecoveryEvent";
import * as RecoverySession from "../domain/RecoverySession";
import * as RecoveryTarget from "../domain/RecoveryTarget";
import * as DeviceControl from "../ports/DeviceControlPort";
import * as Notification from "../ports/NotificationPort";
import * as Sessions from "../ports/RecoverySessionRepository";
import * as Supervision from "../ports/SupervisionPort";
import * as onRecoveryGivenUp from "./policies/onRecoveryGivenUp";

export type Env = Sessions.RecoverySessionRepositoryEnv &
  Supervision.SupervisionEnv &
  DeviceControl.DeviceControlEnv &
  Notification.NotificationEnv &
  Clock.ClockEnv;

export type Output = {
  readonly sessions: ReadonlyArray<RecoverySession.RecoverySession>;
  readonly events: ReadonlyArray<RecoveryEvent>;
  readonly incidents: ReadonlyArray<Incident.Incident>;
};

// Quante volte una sessione può riprogrammarsi dentro un solo battito. Serve a far avanzare in un
// colpo solo gli scatti che non aspettano nulla (uno scarto di gradino, un ritentativo il cui
// backoff è già scaduto), non a simulare il passare del tempo.
const FUEL = 8;

type Run = {
  readonly session: RecoverySession.RecoverySession;
  readonly events: ReadonlyArray<RecoveryEvent>;
  readonly health: HealthSnapshot.HealthSnapshot;
};

const isDue = (session: RecoverySession.RecoverySession, now: Instant): boolean =>
  pipe(
    RecoverySession.nextDueAt(session),
    O.exists((due) => !Instants.isBefore(now, due)),
  );

// Gli effetti di un giro: ogni `RemedyDispatched` diventa una chiamata alla porta, e l'esito
// rientra come comando. È l'unico posto in cui il modello tocca l'hardware.
const applyEffects = (run: Run, events: ReadonlyArray<RecoveryEvent>): RTE.ReaderTaskEither<Env, never, Run> =>
  events.reduce<RTE.ReaderTaskEither<Env, never, Run>>(
    (acc, event) =>
      event._tag !== "RemedyDispatched"
        ? acc
        : pipe(
            acc,
            RTE.flatMap((current) =>
              pipe(
                DeviceControl.apply(RecoveryTarget.actsOn(event.target), event.remedy),
                RTE.flatMap((outcome) =>
                  pipe(
                    Clock.now,
                    RTE.map((at) => {
                      const decision = RecoverySession.decide(current.session, {
                        _tag: "RemedyOutcomeArrived",
                        outcome,
                        now: at,
                      });
                      return {
                        ...current,
                        session: decision.state,
                        events: [...current.events, ...decision.events],
                      };
                    }),
                  ),
                ),
              ),
            ),
          ),
    RTE.right(run),
  );

const round = (run: Run, fuel: number): RTE.ReaderTaskEither<Env, never, Run> => {
  if (fuel <= 0 || !RecoverySession.isActive(run.session)) return RTE.right(run);

  return pipe(
    Clock.now,
    RTE.flatMap((now) =>
      !isDue(run.session, now)
        ? RTE.right(run)
        : pipe(
            Supervision.contextFor(run.session.target),
            RTE.flatMap((ctx) => {
              const decision = RecoverySession.decide(run.session, { _tag: "Tick", now, ctx });
              const ticked: Run = {
                ...run,
                session: decision.state,
                events: [...run.events, ...decision.events],
                health: ctx.health,
              };
              return pipe(
                applyEffects(ticked, decision.events),
                RTE.flatMap((next) => round(next, fuel - 1)),
              );
            }),
          ),
    ),
  );
};

// Al massimo un incidente per sessione: la resa ha la precedenza sull'anticipo per criticità,
// perché porta il dossier completo. Se era stato alzato in anticipo e la sessione poi si risolve,
// si consegna la sua chiusura (M-7).
const incidentFor = (run: Run, now: Instant): RTE.ReaderTaskEither<Env, never, ReadonlyArray<Incident.Incident>> => {
  const has = (tag: RecoveryEvent["_tag"]) => run.events.some((event) => event._tag === tag);
  const immediate = run.session.rules.criticality === "NotifyImmediately";

  const raise = (): RTE.ReaderTaskEither<Env, Notification.NotifyFailed, Incident.Incident> =>
    onRecoveryGivenUp.execute(run.session, run.health, now);

  const closing = (): RTE.ReaderTaskEither<Env, Notification.NotifyFailed, Incident.Incident> => {
    const incident = Incident.close(
      Incident.raise({
        sessionId: run.session.id,
        target: run.session.target,
        criticality: run.session.rules.criticality,
        outageSince: run.session.outageSince,
        history: run.session.history,
        health: run.health,
        reason: O.none,
        at: now,
      }),
      now,
    );
    return pipe(
      Notification.publish(incident),
      RTE.map(() => incident),
    );
  };

  const wanted =
    has("RecoveryGivenUp") || (immediate && has("OutageConfirmed"))
      ? raise
      : immediate && has("DeviceRecovered")
        ? closing
        : undefined;

  // Una notifica non consegnata è un guasto del canale, non del recupero: non deve far fallire il
  // battito né lasciare la sessione a metà.
  return wanted === undefined
    ? RTE.right([])
    : pipe(
        wanted(),
        RTE.map((incident) => [incident]),
        RTE.orElse(() => RTE.right<Env, never, ReadonlyArray<Incident.Incident>>([])),
      );
};

export const execute = (now: Instant): RTE.ReaderTaskEither<Env, never, Output> =>
  pipe(
    Sessions.dueAt(now),
    RTE.flatMap((due) =>
      RTE.traverseArray((session: RecoverySession.RecoverySession) =>
        pipe(
          round({ session, events: [], health: HealthSnapshot.empty }, FUEL),
          RTE.flatMap((run) =>
            pipe(
              Sessions.save(run.session),
              RTE.flatMap(() => incidentFor(run, now)),
              RTE.map((incidents) => ({ run, incidents })),
            ),
          ),
        ),
      )(due),
    ),
    RTE.map((results) => ({
      sessions: results.map((result) => result.run.session),
      events: results.flatMap((result) => [...result.run.events]),
      incidents: results.flatMap((result) => [...result.incidents]),
    })),
  );
