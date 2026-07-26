import type { TripwireState } from "./tripwire-machine";

// -------------------------------------------------------------------------------------
// Status feed - broadcast delle transizioni di ogni tripwire (healthy/pending/fired) e
// dell'esito di un tentativo di recovery (succeeded/exhausted). Ricalca predicates/feed.ts
// (ring buffer + subscribe/history, più uno snapshot "valore corrente"): un "outcome" non è
// un evento a parte, è la stessa entry con `state: "fired"` a cui si aggiunge `outcome`.
// -------------------------------------------------------------------------------------

export interface RecoveryStatusEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly policy: string; // RecoveryPolicy.label
  readonly domain: string;
  readonly entityId: string;
  readonly tripwireIndex: number;
  readonly state: TripwireState["tag"];
  readonly outcome?: "succeeded" | "exhausted";
}

// Chiave univoca dell'"ultimo stato noto" per un tripwire, usata per indicizzare lo snapshot
// corrente - stesso schema di predicates/model.ts#factKey / activity/model.ts#activityKey.
export const recoveryKey = (
  entry: Pick<RecoveryStatusEntry, "policy" | "domain" | "entityId" | "tripwireIndex">,
): string => `${entry.policy}:${entry.domain}:${entry.entityId}:${entry.tripwireIndex}`;

export interface RecoveryFeed {
  readonly subscribe: (listener: (entry: RecoveryStatusEntry) => void) => () => void;
  readonly history: () => readonly RecoveryStatusEntry[];
  // Ultima entry nota per ogni (policy, domain, entityId, tripwireIndex)
  readonly snapshot: () => readonly RecoveryStatusEntry[];
}

export interface RecoveryStream extends RecoveryFeed {
  readonly emit: (entry: Omit<RecoveryStatusEntry, "id" | "timestamp">) => void;
}

export const createRecoveryStream = (bufferSize = 1000): RecoveryStream => {
  const buffer: RecoveryStatusEntry[] = [];
  const current = new Map<string, RecoveryStatusEntry>();
  const listeners = new Set<(entry: RecoveryStatusEntry) => void>();

  let nextId = 0;

  const emit: RecoveryStream["emit"] = (fact) => {
    const entry: RecoveryStatusEntry = { ...fact, id: nextId++, timestamp: Date.now() };

    current.set(recoveryKey(entry), entry);
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
