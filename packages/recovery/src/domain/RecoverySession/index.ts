// L'aggregato: la macchina a stati del recupero. Puro e sincrono — riceve `now`, decide,
// restituisce nuovo stato ed eventi — e il contesto viaggia **dentro** il comando `Tick`, non
// nell'ambiente, così `decide` resta una funzione di due argomenti senza Reader e senza I/O.
// Il file è diventato una cartella per stare nel budget: `Phase.ts` tiene le fasi e la domanda
// "quando serve il prossimo tick", `transitions.ts` i modi in cui la sessione cambia fase.
// Qui restano l'apertura, l'ordine del tick e la lettura degli esiti.

import { Decider, type Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";
import type { AbortReason } from "../AbortReason";
import * as AbortReasons from "../AbortReason";
import type { AttemptRecord } from "../AttemptRecord";
import * as AttemptRecords from "../AttemptRecord";
import * as GiveUpReason from "../GiveUpReason";
import * as Playbook from "../Playbook";
import type { RecoveryEvent } from "../RecoveryEvent";
import type { RecoverySessionId } from "../RecoverySessionId";
import type { RecoveryTarget } from "../RecoveryTarget";
import type { RemedyOutcome } from "../RemedyOutcome";
import * as RetryPolicy from "../RetryPolicy";
import type { SessionRules } from "../SessionRules";
import * as SessionRuleset from "../SessionRules";
import type { SupervisionContext } from "../SupervisionContext";
import type { SupervisionProfile } from "../SupervisionProfile";
import * as Phase from "./Phase";
import * as Transitions from "./transitions";

export type { Phase } from "./Phase";

export type RecoverySession = {
  readonly id: RecoverySessionId;
  readonly target: RecoveryTarget;
  // Quando il guasto è cominciato. Vive sull'aggregato e non solo dentro `AwaitingGrace` perché il
  // dossier di un incidente deve dire da quando il device è giù (M-7), e a quel punto la fase di
  // attesa è passata da un pezzo.
  readonly outageSince: Instant;
  readonly rules: SessionRules;
  readonly phase: Phase.Phase;
  readonly history: ReadonlyArray<AttemptRecord>;
};

export type Command =
  | { readonly _tag: "Tick"; readonly now: Instant; readonly ctx: SupervisionContext }
  | { readonly _tag: "RemedyOutcomeArrived"; readonly outcome: RemedyOutcome; readonly now: Instant }
  | { readonly _tag: "Abort"; readonly reason: AbortReason; readonly now: Instant };

export const isActive = (session: RecoverySession): boolean => Phase.isActive(session.phase);

export const nextDueAt = (session: RecoverySession): O.Option<Instant> => Phase.nextDueAt(session.phase);

// Un cluster ha un grace suo, quello della policy di correlazione (FL-3): il tempo che si concede
// a un guasto singolo e quello che si concede a un quorum già formato sono due decisioni diverse.
const graceFor = (target: RecoveryTarget, profile: SupervisionProfile) =>
  target._tag === "ControlUnitCluster" && O.isSome(profile.correlation)
    ? profile.correlation.value.gracePeriod
    : profile.gracePeriod;

// L'apertura congela le regole (INV-13) e conta il grace da quando l'outage è cominciato, non da
// adesso: un guasto scoperto in ritardo è comunque un guasto vecchio.
export const open = (
  id: RecoverySessionId,
  target: RecoveryTarget,
  profile: SupervisionProfile,
  outageSince: Instant,
  now: Instant,
): Decision<RecoverySession, RecoveryEvent> =>
  Decider.decision(
    {
      id,
      target,
      outageSince,
      rules: SessionRuleset.freeze(profile),
      phase: {
        _tag: "AwaitingGrace",
        outageSince,
        dueAt: Instants.plus(outageSince, graceFor(target, profile)),
      },
      history: [],
    },
    [{ _tag: "RecoverySessionOpened", at: now, sessionId: id, target, outageSince }],
  );

const onVerifying = (
  session: RecoverySession,
  phase: Phase.Verifying,
  now: Instant,
  ctx: SupervisionContext,
): Transitions.Transition => {
  const step = Transitions.stepAt(session, phase.step);
  const facet = step.verification.facet;
  const settled = !Instants.isBefore(now, phase.nextPollAt);
  const succeeded: RecoveryEvent = {
    _tag: "VerificationSucceeded",
    at: now,
    sessionId: session.id,
    step: phase.step,
    attempt: phase.attempt,
    facet,
  };

  // Prima dell'assestamento non si giudica: il device si sta ancora spegnendo (FATTO-13). E anche
  // dopo, non basta che la faccia risulti sana: `notBefore` pretende che lo sia diventata **dopo**
  // il dispaccio, altrimenti è una lettura stantia (INV-5).
  if (settled && Transitions.isHealthy(session, ctx, O.some(phase.dispatchedAt), facet)) {
    // L'unica transizione di tutta la cartella che produce `Resolved` (INV-5).
    if (facet === session.rules.trigger)
      return Decider.decision(
        {
          ...session,
          phase: { _tag: "Resolved", at: now },
          history: Transitions.closeLast(session, "Recovered", now),
        },
        [succeeded, { _tag: "DeviceRecovered", at: now, sessionId: session.id, target: session.target }],
      );

    // INV-6: il rimedio ha fatto il suo lavoro, ma su una faccia che non è quella d'innesco. Si
    // sale di gradino senza consumare tentativi, e senza risolversi.
    const to = Playbook.nextStep(phase.step);
    return Transitions.readyAt(
      { ...session, history: Transitions.closeLast(session, "Recovered", now) },
      to,
      RetryPolicy.first,
      now,
      now,
      [succeeded, { _tag: "StepAdvanced", at: now, sessionId: session.id, from: phase.step, to }],
    );
  }

  if (!Instants.isBefore(now, phase.deadline))
    return Transitions.failAttempt(session, phase.step, phase.attempt, now, [
      { _tag: "VerificationTimedOut", at: now, sessionId: session.id, step: phase.step, attempt: phase.attempt, facet },
    ]);

  return settled
    ? Decider.unchanged({
        ...session,
        phase: { ...phase, nextPollAt: Instants.plus(now, step.verification.pollInterval) },
      })
    : Decider.unchanged(session);
};

// L'ordine del tick è quello di M-6, e non è negoziabile: prima gli impedimenti del contesto,
// poi l'auto-guarigione, poi la transizione della fase.
const onTick = (session: RecoverySession, now: Instant, ctx: SupervisionContext): Transitions.Transition => {
  const phase = session.phase;

  const blocked = Transitions.impediment(ctx, now);
  if (O.isSome(blocked)) return Transitions.abort(session, blocked.value, now);

  // INV-7: il controllo sta nel punto — e solo nel punto — in cui sta per partire un comando. Una
  // CU che sfarfalla trenta secondi non si prende un reboot al minuto uno.
  if ((phase._tag === "AwaitingGrace" || phase._tag === "BackingOff") && Transitions.isHealthy(session, ctx, O.none))
    return Transitions.abort(session, AbortReasons.selfHealed, now);

  switch (phase._tag) {
    case "AwaitingGrace":
      return Instants.isBefore(now, phase.dueAt)
        ? Decider.unchanged(session)
        : Transitions.dispatchFrom(session, Playbook.firstStep, RetryPolicy.first, now, ctx, [
            {
              _tag: "OutageConfirmed",
              at: now,
              sessionId: session.id,
              target: session.target,
              outageSince: phase.outageSince,
            },
          ]);
    case "BackingOff":
      return Instants.isBefore(now, phase.resumeAt)
        ? Decider.unchanged(session)
        : Transitions.dispatchFrom(session, phase.step, phase.attempt, now, ctx, []);
    // INV-10: l'esito non è arrivato in tempo. Una chiamata adb può restare appesa per sempre
    // (FATTO-12), una sessione no.
    case "Executing":
      return Instants.isBefore(now, phase.deadline)
        ? Decider.unchanged(session)
        : Transitions.failAttempt(session, phase.step, phase.attempt, now, [
            { _tag: "RemedyTimedOut", at: now, sessionId: session.id, step: phase.step, attempt: phase.attempt },
          ]);
    default:
      return onVerifying(session, phase as Phase.Verifying, now, ctx);
  }
};

const onOutcome = (session: RecoverySession, outcome: RemedyOutcome, now: Instant): Transitions.Transition => {
  const phase = session.phase;
  // Un esito che arriva quando non c'è nulla in volo — o dopo la scadenza, quando la sessione è
  // già andata avanti — non è un errore: è tardivo, e si ignora.
  if (phase._tag !== "Executing") return Decider.unchanged(session);

  const last = session.history.length - 1;
  const recorded: RecoverySession = {
    ...session,
    history: session.history.map((record, index) =>
      index === last ? AttemptRecords.withOutcome(record, outcome) : record,
    ),
  };
  const step = Transitions.stepAt(session, phase.step);
  const failed: RecoveryEvent = {
    _tag: "RemedyFailed",
    at: now,
    sessionId: session.id,
    step: phase.step,
    attempt: phase.attempt,
    outcome,
  };

  // INV-10, dall'altro lato: l'esito è arrivato, ma dopo la scadenza. Accettarlo significherebbe
  // ripartire a verificare un comando di cui non sappiamo più nulla — e la sessione ha già una
  // scadenza proprio perché una chiamata adb può metterci un tempo arbitrario (FATTO-12).
  if (!Instants.isBefore(now, phase.deadline))
    return Transitions.failAttempt(recorded, phase.step, phase.attempt, now, [
      { _tag: "RemedyTimedOut", at: now, sessionId: session.id, step: phase.step, attempt: phase.attempt },
    ]);

  switch (outcome._tag) {
    // `Accepted` significa "preso in carico", non "guarito": si passa a verificare, e la
    // guarigione la stabilisce solo la verifica.
    case "Accepted":
      return Decider.unchanged({
        ...recorded,
        phase: {
          _tag: "Verifying",
          step: phase.step,
          attempt: phase.attempt,
          dispatchedAt: phase.dispatchedAt,
          nextPollAt: Instants.plus(now, step.verification.settleDelay),
          deadline: Instants.plus(now, step.verification.timeout),
        },
      });
    // FL-2: ritentare una cosa che quel device non saprà mai fare è solo rumore.
    case "Unsupported":
      return Transitions.giveUp(recorded, GiveUpReason.remedyUnsupported, now, [failed]);
    default:
      return Transitions.failAttempt(recorded, phase.step, phase.attempt, now, [failed]);
  }
};

export const decide = (session: RecoverySession, command: Command): Decision<RecoverySession, RecoveryEvent> => {
  // INV-9: da `GivenUp` non si esce, e la fase assorbe ogni comando. Le altre fasi terminali si
  // comportano allo stesso modo — una sessione finita non torna indietro.
  if (!isActive(session)) return Decider.unchanged(session);

  switch (command._tag) {
    case "Tick":
      return onTick(session, command.now, command.ctx);
    case "RemedyOutcomeArrived":
      return onOutcome(session, command.outcome, command.now);
    case "Abort":
      return Transitions.abort(session, command.reason, command.now);
  }
};
