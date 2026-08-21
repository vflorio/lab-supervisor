// Quanti tentativi per un gradino e con che attesa fra l'uno e l'altro.
// Da non confondere con il retry di **trasporto** dell'adapter: un `ECONNRESET` ritentato
// dall'HTTP client non è un tentativo di recovery, è la stessa chiamata che ci riprova. Sono
// due livelli, e confonderli è l'errore ricorrente: qui un tentativo è un rimedio dispacciato
// e verificato, con la sua riga nel dossier.

import { type Brand, brand } from "@lab/kernel";
import * as Duration from "@lab/kernel/Duration";

// Numero del tentativo dentro un gradino, 1-based: il primo dispaccio è il tentativo 1, e
// `attempt ≤ maxAttempts` è INV-2.
export type AttemptNo = Brand<number, "AttemptNo">;

export const attemptNo = (value: number): AttemptNo => brand<AttemptNo>(Math.max(1, Math.trunc(value)));

export const first: AttemptNo = attemptNo(1);

export const next = (attempt: AttemptNo): AttemptNo => attemptNo(attempt + 1);

export type Backoff =
  | { readonly _tag: "Fixed"; readonly delay: Duration.Duration }
  | {
      readonly _tag: "Exponential";
      readonly base: Duration.Duration;
      readonly factor: number;
      readonly cap: Duration.Duration;
    };

export const fixed = (delay: Duration.Duration): Backoff => ({ _tag: "Fixed", delay });

export const exponential = (base: Duration.Duration, factor: number, cap: Duration.Duration): Backoff => ({
  _tag: "Exponential",
  base,
  factor,
  cap,
});

// L'attesa *dopo* il tentativo appena fallito, prima di quello successivo.
export const delayAfter = (backoff: Backoff, attempt: AttemptNo): Duration.Duration =>
  backoff._tag === "Fixed"
    ? backoff.delay
    : Duration.min(Duration.times(backoff.base, backoff.factor ** (attempt - 1)), backoff.cap);

export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly backoff: Backoff;
};

export const make = (maxAttempts: number, backoff: Backoff): RetryPolicy => ({
  maxAttempts: Math.max(1, Math.trunc(maxAttempts)),
  backoff,
});

// Un solo posto in tutto il modello risponde a "si può ritentare?" (INV-2).
export const hasAttemptsLeft = (policy: RetryPolicy, attempt: AttemptNo): boolean => attempt < policy.maxAttempts;
