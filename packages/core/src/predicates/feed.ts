import type { PredicateLookup } from "./expression";
import { factKey, type PredicateEntry, type PredicateFact } from "./model";

// In-memory predicate broadcast (fatti di dominio -> subscriber live + tabella corrente).
// Subscribe/history (ring buffer) con l'aggiunta di uno `snapshot()`: a differenza dei log
// (solo append-only), i predicati devono anche poter rispondere "cos'è vero adesso", non
// solo "cosa è cambiato".

export interface PredicateFeed {
  readonly subscribe: (listener: (entry: PredicateEntry) => void) => () => void;
  readonly history: () => readonly PredicateEntry[];
  readonly snapshot: () => readonly PredicateEntry[];
}

export interface PredicateStream extends PredicateFeed {
  // Emette un fatto solo se il suo valore è realmente cambiato rispetto all'ultimo noto
  // (no-op idempotente altrimenti) - i tracker sono comunque tenuti a diffare a monte,
  // questo è solo un guard difensivo.
  readonly emit: (fact: PredicateFact) => void;
}

// Vista PredicateLookup su una singola entità del feed. Rilegge lo snapshot ad ogni chiamata
// invece di catturarne uno: chi la usa (es. il comando `awaitPredicate`) sta proprio aspettando
// che i fatti cambino sotto di sé.
export const lookupFor =
  (feed: PredicateFeed, domain: string, entityId: string): PredicateLookup =>
  (name) =>
    feed.snapshot().find((entry) => entry.domain === domain && entry.entityId === entityId && entry.name === name)
      ?.value;

export const createPredicateStream = (bufferSize = 1000): PredicateStream => {
  const buffer: PredicateEntry[] = [];
  const current = new Map<string, PredicateEntry>();
  const listeners = new Set<(entry: PredicateEntry) => void>();

  let nextId = 0;

  const emit: PredicateStream["emit"] = (fact) => {
    const key = factKey(fact);
    const existing = current.get(key);
    if (existing && existing.value === fact.value) return;

    const entry: PredicateEntry = { ...fact, id: nextId++, timestamp: Date.now() };

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
