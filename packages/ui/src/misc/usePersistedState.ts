import { useLayoutEffect, useState } from "react";

export interface PersistedStateCodec<T> {
  readonly serialize: (value: T) => string;
  // Ritorna undefined per un raw mancante/invalido: il default resta quello del primo render.
  readonly deserialize: (raw: string) => T | undefined;
}

// Idrata da localStorage solo dopo il mount (mai durante l'SSR): il primo render deve
// combaciare esattamente con l'HTML del server (defaultValue), altrimenti React segnala un
// hydration mismatch - l'eventuale valore salvato viene applicato subito dopo, in un secondo
// render, prima del paint (useLayoutEffect) per evitare un flash del default.
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
  codec: PersistedStateCodec<T>,
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState(defaultValue);

  useLayoutEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return;
    const parsed = codec.deserialize(raw);
    if (parsed !== undefined) setValue(parsed);
  }, [storageKey]);

  const persist = (next: T) => {
    setValue(next);
    window.localStorage.setItem(storageKey, codec.serialize(next));
  };

  return [value, persist];
}

export const booleanCodec: PersistedStateCodec<boolean> = {
  serialize: (value) => String(value),
  deserialize: (raw) => raw === "true",
};
