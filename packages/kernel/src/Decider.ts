// L'idioma con cui gli aggregati decidono (A-5): `(stato, comando) => [stato, eventi]`.
// Puro e sincrono per costruzione — non c'è posto dove infilare un effetto — ed è la ragione
// per cui il dominio può essere provato senza hardware, senza rete e senza orologio.
// Non è un motore: non esegue nulla e non conosce le porte. Il ciclo comando → effetto →
// evento lo fa girare l'application layer (M-9).

export type Decision<S, E> = {
  readonly state: S;
  readonly events: ReadonlyArray<E>;
};

export type Decider<S, C, E> = (state: S, command: C) => Decision<S, E>;

export const decision = <S, E>(state: S, events: ReadonlyArray<E> = []): Decision<S, E> => ({ state, events });

export const unchanged = <S, E = never>(state: S): Decision<S, E> => ({ state, events: [] });

// Concatena due decisioni accumulando gli eventi in ordine: serve alle transizioni composte
// (es. "chiudi il tentativo, poi avanza di gradino"), che devono restare un solo passo
// atomico e lasciare una sola traccia coerente.
export const andThen = <S, E>(previous: Decision<S, E>, next: (state: S) => Decision<S, E>): Decision<S, E> => {
  const following = next(previous.state);
  return { state: following.state, events: [...previous.events, ...following.events] };
};

export const emit = <S, E>(decision: Decision<S, E>, ...events: ReadonlyArray<E>): Decision<S, E> => ({
  state: decision.state,
  events: [...decision.events, ...events],
});
