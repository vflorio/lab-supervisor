import type { LoopEntry } from "./model";

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
