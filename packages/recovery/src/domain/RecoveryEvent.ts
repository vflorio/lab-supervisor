// I fatti che il recupero pubblica. Nomi al passato: `RemedyDispatched` dice che un comando è
// partito, non che si debba farlo partire. È l'application layer, leggendo l'evento, a chiamare
// la porta e a riportare l'esito indietro come comando (M-9).
// `RemedyDispatched` porta il bersaglio perché chi lo esegue deve sapere su *quale* device
// agire, e per un cluster non è nessuno dei figli: è la CU.

import type { DomainEvent } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import type { Facet } from "@lab/monitoring/domain/Facet";
import type { AbortReason } from "./AbortReason";
import type { GiveUpReason } from "./GiveUpReason";
import type { StepIndex } from "./Playbook";
import type { RecoverySessionId } from "./RecoverySessionId";
import type { RecoveryTarget } from "./RecoveryTarget";
import type { Remedy } from "./Remedy";
import type { RemedyOutcome } from "./RemedyOutcome";
import type { FacetCondition } from "./RemedyStep";
import type { AttemptNo } from "./RetryPolicy";

type OfSession<Payload extends object = Record<never, never>> = { sessionId: RecoverySessionId } & Payload;

export type RecoverySessionOpened = DomainEvent<
  "RecoverySessionOpened",
  OfSession<{ target: RecoveryTarget; outageSince: Instant }>
>;

// Il guasto è durato abbastanza da essere un problema di business, non solo un fatto: è
// scaduto il grace del profilo. Da qui in poi si agisce.
export type OutageConfirmed = DomainEvent<
  "OutageConfirmed",
  OfSession<{ target: RecoveryTarget; outageSince: Instant }>
>;

export type RemedyDispatched = DomainEvent<
  "RemedyDispatched",
  OfSession<{ target: RecoveryTarget; step: StepIndex; attempt: AttemptNo; remedy: Remedy; deadline: Instant }>
>;

export type RemedyFailed = DomainEvent<
  "RemedyFailed",
  OfSession<{ step: StepIndex; attempt: AttemptNo; outcome: RemedyOutcome }>
>;

export type RemedyTimedOut = DomainEvent<"RemedyTimedOut", OfSession<{ step: StepIndex; attempt: AttemptNo }>>;

export type StepSkipped = DomainEvent<
  "StepSkipped",
  OfSession<{ step: StepIndex; remedy: Remedy; condition: FacetCondition }>
>;

export type StepAdvanced = DomainEvent<"StepAdvanced", OfSession<{ from: StepIndex; to: StepIndex }>>;

export type VerificationSucceeded = DomainEvent<
  "VerificationSucceeded",
  OfSession<{ step: StepIndex; attempt: AttemptNo; facet: Facet }>
>;

export type VerificationTimedOut = DomainEvent<
  "VerificationTimedOut",
  OfSession<{ step: StepIndex; attempt: AttemptNo; facet: Facet }>
>;

export type RecoveryAttemptExhausted = DomainEvent<
  "RecoveryAttemptExhausted",
  OfSession<{ step: StepIndex; attempts: number }>
>;

export type DeviceRecovered = DomainEvent<"DeviceRecovered", OfSession<{ target: RecoveryTarget }>>;

export type RecoveryGivenUp = DomainEvent<
  "RecoveryGivenUp",
  OfSession<{ target: RecoveryTarget; reason: GiveUpReason; retryNotBefore: Instant }>
>;

export type RecoverySessionAborted = DomainEvent<
  "RecoverySessionAborted",
  OfSession<{ target: RecoveryTarget; reason: AbortReason }>
>;

export type RecoveryEvent =
  | RecoverySessionOpened
  | OutageConfirmed
  | RemedyDispatched
  | RemedyFailed
  | RemedyTimedOut
  | StepSkipped
  | StepAdvanced
  | VerificationSucceeded
  | VerificationTimedOut
  | RecoveryAttemptExhausted
  | DeviceRecovered
  | RecoveryGivenUp
  | RecoverySessionAborted;
