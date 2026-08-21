// Quante osservazioni concordi servono per cambiare stato. È l'unica invariante di questo
// contesto: una faccia che sfarfalla non deve mai far partire un recupero, e la soglia è il
// punto in cui il rumore si ferma.
// Asimmetrica di proposito: si può volere prudenza nel dichiarare un guasto e prontezza nel
// dichiarare una guarigione, o il contrario.

export type FlappingPolicy = {
  readonly failureThreshold: number;
  readonly successThreshold: number;
};

// Le soglie sotto 1 non hanno senso: una transizione senza nemmeno un'osservazione che la
// sostenga non è anti-flapping, è indovinare.
export const make = (failureThreshold: number, successThreshold: number): FlappingPolicy => ({
  failureThreshold: Math.max(1, Math.trunc(failureThreshold)),
  successThreshold: Math.max(1, Math.trunc(successThreshold)),
});

// Nessun filtro: ogni osservazione è una conferma. Utile nei test, sconsigliata sul campo.
export const immediate: FlappingPolicy = make(1, 1);

export const thresholdFor = (policy: FlappingPolicy, ok: boolean): number =>
  ok ? policy.successThreshold : policy.failureThreshold;
