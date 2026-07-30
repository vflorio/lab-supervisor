import type { LoopEntry } from "./model";

// "Valore corrente per loop" (Service -> Web), non un ring buffer: a differenza di
// ActivityStream/RecoveryStream, di un heartbeat non esiste uno storico da riprodurre alla
// prima connessione, esiste solo l'ultimo battito - stessa forma di AndroidBridge.devicesFeed.

export interface LoopFeed {
  readonly subscribe: (listener: (entry: LoopEntry) => void) => () => void;
  readonly snapshot: () => readonly LoopEntry[];
}

export interface LoopStream extends LoopFeed {
  readonly publish: (entry: LoopEntry) => void;
}

export const createLoopStream = (): LoopStream => {
  const current = new Map<string, LoopEntry>();
  const listeners = new Set<(entry: LoopEntry) => void>();

  return {
    publish: (entry) => {
      current.set(entry.id, entry);
      for (const listener of listeners) listener(entry);
    },
    snapshot: () => Array.from(current.values()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
