// Le transizioni condivise della macchina: fermarsi, arrendersi, dispacciare, fallire un
// tentativo. Stanno insieme perché sono i soli modi in cui la sessione cambia fase, e tenerle in
// un posto solo è ciò che rende verificabili a colpo d'occhio le invarianti che le riguardano —
// INV-2 (un solo punto incrementa un tentativo), INV-3 (un solo punto dispaccia), INV-4 (l'indice
// va solo avanti), INV-9 (la resa fissa un cooldown).

import { Decider, type Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import * as Custody from "@lab/registry/domain/Custody";
import * as O from "fp-ts/Option";
import * as AbortReason from "../AbortReason";
import * as AttemptRecord from "../AttemptRecord";
import * as GiveUpReason from "../GiveUpReason";
import { isTargetHealthy } from "../isTargetHealthy";
import * as Playbook from "../Playbook";
import type { RecoveryEvent } from "../RecoveryEvent";
import * as RecoveryTarget from "../RecoveryTarget";
import type { RemedyStep } from "../RemedyStep";
import * as RemedySteps from "../RemedyStep";
import * as RetryPolicy from "../RetryPolicy";
import * as SessionRules from "../SessionRules";
import type { SupervisionContext } from "../SupervisionContext";
import * as SupervisionWindow from "../SupervisionWindow";
import type { RecoverySession } from "./index";

export type Transition = Decision<RecoverySession, RecoveryEvent>;

export const stepAt = (session: RecoverySession, index: Playbook.StepIndex): RemedyStep =>
  session.rules.playbook.steps[index] as RemedyStep;

export const closeLast = (
  session: RecoverySession,
  verdict: AttemptRecord.Verdict,
  at: Instant,
): ReadonlyArray<AttemptRecord.AttemptRecord> => {
  const last = session.history.length - 1;
  return last >= 0 && AttemptRecord.isOpen(session.history[last])
    ? session.history.map((record, index) => (index === last ? AttemptRecord.close(record, verdict, at) : record))
    : session.history;
};

// Un abort non è una resa: nessun incidente e nessun cooldown, perché in nessuno di questi casi
// il device è rotto.
export const abort = (session: RecoverySession, reason: AbortReason.AbortReason, at: Instant): Transition =>
  Decider.decision(
    { ...session, phase: { _tag: "Aborted", reason, at }, history: closeLast(session, "NotRecovered", at) },
    [{ _tag: "RecoverySessionAborted", at, sessionId: session.id, target: session.target, reason }],
  );

// La resa fissa un `retryNotBefore` che blocca l'apertura di nuove sessioni sugli stessi device
// finché non è passato (INV-9): senza, un device rotto verrebbe riavviato e notificato a ogni
// ciclo di monitoraggio.
export const giveUp = (
  session: RecoverySession,
  reason: GiveUpReason.GiveUpReason,
  at: Instant,
  events: ReadonlyArray<RecoveryEvent>,
): Transition => {
  const retryNotBefore = Instants.plus(at, session.rules.cooldownAfterGiveUp);
  return Decider.decision(
    {
      ...session,
      phase: { _tag: "GivenUp", reason, at, retryNotBefore },
      history: closeLast(session, "NotRecovered", at),
    },
    [...events, { _tag: "RecoveryGivenUp", at, sessionId: session.id, target: session.target, reason, retryNotBefore }],
  );
};

// Il gradino successivo non parte da qui: si passa da `BackingOff`, che insieme ad
// `AwaitingGrace` è la sola fase da cui un `Tick` dispaccia. È ciò che rende INV-3 vera anche
// quando la transizione nasce dall'esito di un rimedio, cioè da un comando che il contesto non
// ce l'ha e quindi non *può* mandare niente all'hardware.
export const readyAt = (
  session: RecoverySession,
  step: Playbook.StepIndex,
  attempt: RetryPolicy.AttemptNo,
  resumeAt: Instant,
  at: Instant,
  events: ReadonlyArray<RecoveryEvent>,
): Transition =>
  Playbook.isExhausted(session.rules.playbook, step)
    ? giveUp(session, GiveUpReason.playbookExhausted, at, events)
    : Decider.decision({ ...session, phase: { _tag: "BackingOff", step, attempt, resumeAt } }, events);

// L'unico punto del modello che manda un comando all'esterno, e ci si arriva solo da un `Tick`
// (INV-3). Cammina in avanti scartando i gradini la cui precondizione non è soddisfatta: uno
// scarto non è un fallimento, non consuma tentativi, ma fa avanzare l'indice (INV-4) e lascia la
// sua riga nel dossier — che deve spiegare anche perché un rimedio non è stato provato.
export const dispatchFrom = (
  session: RecoverySession,
  from: Playbook.StepIndex,
  attempt: RetryPolicy.AttemptNo,
  now: Instant,
  ctx: SupervisionContext,
  events: ReadonlyArray<RecoveryEvent>,
): Transition => {
  const actsOn = RecoveryTarget.actsOn(session.target);
  const collected = [...events];
  let index = from;
  let attemptNo = attempt;
  let history = session.history;

  while (!Playbook.isExhausted(session.rules.playbook, index)) {
    const step = stepAt(session, index);
    const condition = step.appliesWhen;

    if (O.isNone(condition) || RemedySteps.applies(step, actsOn, ctx.health)) {
      const deadline = Instants.plus(now, step.dispatchTimeout);
      return Decider.decision(
        {
          ...session,
          phase: { _tag: "Executing", step: index, attempt: attemptNo, dispatchedAt: now, deadline },
          history: [...history, AttemptRecord.dispatched(index, attemptNo, step.remedy, now)],
        },
        [
          ...collected,
          {
            _tag: "RemedyDispatched",
            at: now,
            sessionId: session.id,
            target: session.target,
            step: index,
            attempt: attemptNo,
            remedy: step.remedy,
            deadline,
          },
        ],
      );
    }

    const to = Playbook.nextStep(index);
    history = [...history, AttemptRecord.skipped(index, step.remedy, now, attemptNo)];
    collected.push(
      {
        _tag: "StepSkipped",
        at: now,
        sessionId: session.id,
        step: index,
        remedy: step.remedy,
        condition: condition.value,
      },
      { _tag: "StepAdvanced", at: now, sessionId: session.id, from: index, to },
    );
    index = to;
    attemptNo = RetryPolicy.first;
  }

  return giveUp({ ...session, history }, GiveUpReason.playbookExhausted, now, collected);
};

// L'unico posto in tutto il modello che incrementa un tentativo (INV-2).
export const failAttempt = (
  session: RecoverySession,
  step: Playbook.StepIndex,
  attempt: RetryPolicy.AttemptNo,
  now: Instant,
  events: ReadonlyArray<RecoveryEvent>,
): Transition => {
  const closed: RecoverySession = { ...session, history: closeLast(session, "NotRecovered", now) };
  const retry = stepAt(session, step).retry;

  if (RetryPolicy.hasAttemptsLeft(retry, attempt))
    return readyAt(
      closed,
      step,
      RetryPolicy.next(attempt),
      Instants.plus(now, RetryPolicy.delayAfter(retry.backoff, attempt)),
      now,
      events,
    );

  const to = Playbook.nextStep(step);
  return readyAt(closed, to, RetryPolicy.first, now, now, [
    ...events,
    { _tag: "RecoveryAttemptExhausted", at: now, sessionId: session.id, step, attempts: attempt },
    { _tag: "StepAdvanced", at: now, sessionId: session.id, from: step, to },
  ]);
};

// Finestra chiusa o device in mano a qualcun altro: nessun comando parte e la sessione si ferma
// subito invece di aspettare (FATTO-14, FATTO-15, INV-3).
export const impediment = (ctx: SupervisionContext, now: Instant): O.Option<AbortReason.AbortReason> => {
  if (!SupervisionWindow.isOpen(ctx.window, now)) return O.some(AbortReason.outOfWindow);
  if (ctx.custody._tag === "Operator") return O.some(AbortReason.maintenanceHold(ctx.custody.reason));
  if (!Custody.allowsSupervisor(ctx.custody, now)) return O.some(AbortReason.custodyLost);
  return O.none;
};

// Passa sempre per `isTargetHealthy`: una sola funzione decide se un bersaglio è sano, che la
// domanda sia l'auto-guarigione (INV-7), la verifica di un rimedio (INV-5) o il verdetto su un
// cluster (INV-8). Se ne esistessero tre, il modello starebbe già mentendo (NO-2).
export const isHealthy = (
  session: RecoverySession,
  ctx: SupervisionContext,
  notBefore: O.Option<Instant>,
  facet = session.rules.trigger,
): boolean =>
  isTargetHealthy(session.target, facet, SessionRules.correlationRule(session.rules), ctx.health, notBefore);
