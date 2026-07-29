import type { SlackDispatchResult } from "./dispatch";
import type { NotifyLifecycle } from "./model";

// Notify feed - broadcast di ogni notifica valutata (una entry per regola, non solo quelle
// inviate con successo). Ring buffer + subscribe/history, nessuno snapshot "per chiave": a
// differenza dello stato di un tripwire, una notifica è un evento puntuale, non un valore
// che si aggiorna nel tempo.

export interface NotifyEventSource {
  readonly policy: string; // RecoveryPolicy.label
  readonly domain: string;
  readonly entityId: string;
  readonly tripwireIndex: number;
}

export interface NotifyEvent {
  readonly id: number;
  readonly timestamp: number;
  readonly source: NotifyEventSource;
  readonly lifecycle: NotifyLifecycle;
  readonly channel: string;
  readonly message: string;
  readonly dispatch: { readonly slack: SlackDispatchResult };
}

export interface NotifyFeed {
  readonly subscribe: (listener: (entry: NotifyEvent) => void) => () => void;
  readonly history: () => readonly NotifyEvent[];
}

export interface NotifyStream extends NotifyFeed {
  readonly emit: (entry: Omit<NotifyEvent, "id" | "timestamp">) => void;
}

export const createNotifyStream = (bufferSize = 1000): NotifyStream => {
  const buffer: NotifyEvent[] = [];
  const listeners = new Set<(entry: NotifyEvent) => void>();

  let nextId = 0;

  const emit: NotifyStream["emit"] = (fact) => {
    const entry: NotifyEvent = { ...fact, id: nextId++, timestamp: Date.now() };

    buffer.push(entry);
    if (buffer.length > bufferSize) buffer.shift();

    for (const listener of listeners) listener(entry);
  };

  return {
    emit,
    history: () => buffer.slice(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
