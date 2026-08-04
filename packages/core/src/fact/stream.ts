import type { FactLookup } from "./condition";
import { type Fact, type FactEntry, factKey } from "./model";

// In-memory fact broadcast (fatti di dominio -> subscriber live + tabella corrente).
// Subscribe/history (ring buffer) con l'aggiunta di uno `snapshot()`: a differenza dei log
// (solo append-only), i fatti devono anche poter rispondere "cos'è vero adesso", non
// solo "cosa è cambiato".

export interface FactFeed {
  readonly subscribe: (listener: (entry: FactEntry) => void) => () => void;
  readonly history: () => readonly FactEntry[];
  readonly snapshot: () => readonly FactEntry[];
}

export interface FactStream extends FactFeed {
  // Emette un fatto solo se il suo valore è realmente cambiato rispetto all'ultimo noto
  // (no-op idempotente altrimenti) - i tracker sono comunque tenuti a diffare a monte,
  // questo è solo un guard difensivo.
  readonly emit: (fact: Fact) => void;
}

// Vista FactLookup su una singola entità del feed. Rilegge lo snapshot ad ogni chiamata
// invece di catturarne uno: chi la usa (es. il comando `awaitPredicate`) sta proprio aspettando
// che i fatti cambino sotto di sé.
export const lookupFor =
  (feed: FactFeed, domain: string, entityId: string): FactLookup =>
  (name) =>
    feed.snapshot().find((entry) => entry.domain === domain && entry.entityId === entityId && entry.name === name)
      ?.value;

export const createFactStream = (bufferSize = 1000): FactStream => {
  const buffer: FactEntry[] = [];
  const current = new Map<string, FactEntry>();
  const listeners = new Set<(entry: FactEntry) => void>();

  let nextId = 0;

  const emit: FactStream["emit"] = (fact) => {
    const key = factKey(fact);
    const existing = current.get(key);
    if (existing && existing.value === fact.value) return;

    const entry: FactEntry = { ...fact, id: nextId++, timestamp: Date.now() };

    current.set(key, entry);
    buffer.push(entry);
    if (buffer.length > bufferSize) buffer.shift();

    for (const listener of listeners) listener(entry);
  };

  return {
    emit,
    history: () => buffer.slice(),
    snapshot: () => Array.from(current.values()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
