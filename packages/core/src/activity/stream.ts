import { type ActivityEntry, activityKey } from "./model";

// -------------------------------------------------------------------------------------
// Activity feed  (ring buffer + "ultimo per chiave" + subscribe):
// a differenza di notify/stream.ts (eventi puntuali), qui interessa lo stato corrente di
// ogni (source, entityId), non solo lo storico.
// -------------------------------------------------------------------------------------

export interface ActivityFeed {
  readonly subscribe: (listener: (entry: ActivityEntry) => void) => () => void;
  readonly history: () => readonly ActivityEntry[];
  // Ultima entry nota per ogni (source, entityId)
  readonly snapshot: () => readonly ActivityEntry[];
}

export interface ActivityStream extends ActivityFeed {
  readonly emit: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
}

export const createActivityStream = (bufferSize = 1000): ActivityStream => {
  const buffer: ActivityEntry[] = [];
  const current = new Map<string, ActivityEntry>();
  const listeners = new Set<(entry: ActivityEntry) => void>();

  let nextId = 0;

  const emit: ActivityStream["emit"] = (fact) => {
    const entry: ActivityEntry = { ...fact, id: nextId++, timestamp: Date.now() };

    current.set(activityKey(entry), entry);
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
