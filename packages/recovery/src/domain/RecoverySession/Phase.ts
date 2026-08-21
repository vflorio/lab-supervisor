// Le fasi della macchina a stati del recupero, e la sola domanda che si può fare guardandole
// senza il resto della sessione: quando serve il prossimo tick.
// La regola che tiene insieme INV-10 e NO-7: una fase attiva chiede **sempre** un tick, una fase
// terminale non ne chiede mai. Una sessione che smette di chiedere tick senza essere finita
// sparisce dai radar senza mai alzare un incidente, ed è esattamente il buco che INV-10 chiude.

import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";
import type { AbortReason } from "../AbortReason";
import type { GiveUpReason } from "../GiveUpReason";
import type { StepIndex } from "../Playbook";
import type { AttemptNo } from "../RetryPolicy";

export type Phase =
  | { readonly _tag: "AwaitingGrace"; readonly outageSince: Instant; readonly dueAt: Instant }
  | {
      readonly _tag: "Executing";
      readonly step: StepIndex;
      readonly attempt: AttemptNo;
      readonly dispatchedAt: Instant;
      readonly deadline: Instant;
    }
  | {
      readonly _tag: "Verifying";
      readonly step: StepIndex;
      readonly attempt: AttemptNo;
      readonly dispatchedAt: Instant;
      readonly nextPollAt: Instant;
      readonly deadline: Instant;
    }
  | {
      readonly _tag: "BackingOff";
      readonly step: StepIndex;
      readonly attempt: AttemptNo;
      readonly resumeAt: Instant;
    }
  | { readonly _tag: "Resolved"; readonly at: Instant }
  | {
      readonly _tag: "GivenUp";
      readonly reason: GiveUpReason;
      readonly at: Instant;
      readonly retryNotBefore: Instant;
    }
  | { readonly _tag: "Aborted"; readonly reason: AbortReason; readonly at: Instant };

export type Verifying = Extract<Phase, { _tag: "Verifying" }>;

export const isActive = (phase: Phase): boolean =>
  phase._tag !== "Resolved" && phase._tag !== "GivenUp" && phase._tag !== "Aborted";

export const nextDueAt = (phase: Phase): O.Option<Instant> => {
  switch (phase._tag) {
    case "AwaitingGrace":
      return O.some(phase.dueAt);
    case "Executing":
      return O.some(phase.deadline);
    case "Verifying":
      return O.some(Instants.earliest(phase.nextPollAt, phase.deadline));
    case "BackingOff":
      return O.some(phase.resumeAt);
    default:
      return O.none;
  }
};
