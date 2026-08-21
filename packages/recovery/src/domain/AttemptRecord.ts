// Una riga del dossier. È la materia prima dell'`Incident` e del messaggio che finisce su
// Slack, e per questo la storia si tiene **dentro** l'aggregato invece di ricostruirla dai log.
// Ogni scarto e ogni avanzamento ci finiscono: il dossier deve spiegare anche perché un gradino
// non è stato provato, non solo quali sono falliti.
// `verdict` è il giudizio su *quel tentativo*, non sulla sessione: `Recovered` significa che la
// verifica di quel gradino è passata, il che per un gradino che verifica una faccia diversa da
// quella d'innesco non vuol dire affatto che il bersaglio sia guarito (INV-6).

import type { Instant } from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";
import type { StepIndex } from "./Playbook";
import type { Remedy } from "./Remedy";
import type { RemedyOutcome } from "./RemedyOutcome";
import type { AttemptNo } from "./RetryPolicy";

export type Verdict = "Recovered" | "NotRecovered" | "Skipped";

export type AttemptRecord = {
  readonly step: StepIndex;
  readonly attempt: AttemptNo;
  readonly remedy: Remedy;
  readonly dispatchedAt: Instant;
  readonly outcome: O.Option<RemedyOutcome>;
  readonly verdict: O.Option<Verdict>;
  readonly closedAt: O.Option<Instant>;
};

export const dispatched = (step: StepIndex, attempt: AttemptNo, remedy: Remedy, at: Instant): AttemptRecord => ({
  step,
  attempt,
  remedy,
  dispatchedAt: at,
  outcome: O.none,
  verdict: O.none,
  closedAt: O.none,
});

// Un gradino scartato non ha un dispaccio: `dispatchedAt` è l'istante in cui è stato valutato e
// messo da parte, e la riga nasce già chiusa.
export const skipped = (step: StepIndex, remedy: Remedy, at: Instant, attempt: AttemptNo): AttemptRecord => ({
  step,
  attempt,
  remedy,
  dispatchedAt: at,
  outcome: O.none,
  verdict: O.some<Verdict>("Skipped"),
  closedAt: O.some(at),
});

export const withOutcome = (record: AttemptRecord, outcome: RemedyOutcome): AttemptRecord => ({
  ...record,
  outcome: O.some(outcome),
});

export const close = (record: AttemptRecord, verdict: Verdict, at: Instant): AttemptRecord => ({
  ...record,
  verdict: O.some(verdict),
  closedAt: O.some(at),
});

export const isOpen = (record: AttemptRecord): boolean => O.isNone(record.closedAt);
