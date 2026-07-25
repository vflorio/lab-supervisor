export * from "./codec";
export * from "./interpret";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Status {
  readonly iteration: number;
  readonly previousDelay: number | null;
}

export const initialStatus: Status = {
  iteration: 0,
  previousDelay: null, // Indichiamo c
};

// Una Policy è una funzione che dato uno Status restituisce un delay in millisecondi
// con null indichiamo che la policy ha terminato i tentativi
export type Policy = (status: Status) => number | null;

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

// Delay costante, tentativi infiniti
export const constantDelay =
  (delay: number): Policy =>
  () =>
    delay;

// Riprova subito, ma al massimo n volte
export const limitRetries =
  (retryCount: number): Policy =>
  (status) =>
    status.iteration >= retryCount ? null : 0;

// Delay esponenziale, tentativi infiniti
export const exponentialBackoff =
  (delay: number): Policy =>
  (status) =>
    delay * 2 ** status.iteration;

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

// Imposta un limite massimo di delay per una policy
export const capDelay =
  (maxDelay: number) =>
  (policy: Policy): Policy =>
  (status) => {
    const delay = policy(status);
    return delay === null ? null : Math.min(maxDelay, delay);
  };

// Combina due policy: si continua solo se entrambe dicono di continuare,
// si aspetta il delay più lungo tra le due
export const concat =
  (second: Policy) =>
  (first: Policy): Policy =>
  (status) => {
    const delay1 = first(status);
    const delay2 = second(status);

    if (delay1 !== null && delay2 !== null) {
      return Math.max(delay1, delay2);
    }

    return null;
  };
