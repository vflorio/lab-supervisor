import type { LogRecord, Transport } from "./logger";

// -------------------------------------------------------------------------------------
// In-memory log broadcast (structured records -> live subscribers)
// -------------------------------------------------------------------------------------

export interface LogEntry extends LogRecord {
  readonly id: number;
}

export interface LogFeed {
  readonly subscribe: (listener: (entry: LogEntry) => void) => () => void;
  readonly history: () => readonly LogEntry[];
}

export interface LogStream extends LogFeed {
  readonly transport: Transport;
}

export const createLogStream = (bufferSize = 1000): LogStream => {
  const buffer: LogEntry[] = [];
  const listeners = new Set<(entry: LogEntry) => void>();
  let nextId = 0;

  const transport: Transport = (record) => {
    const entry: LogEntry = { ...record, id: nextId++ };

    buffer.push(entry);
    if (buffer.length > bufferSize) buffer.shift();

    for (const listener of listeners) listener(entry);
  };

  return {
    transport,
    history: () => buffer.slice(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
