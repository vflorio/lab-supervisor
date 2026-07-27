import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc/client";

export type ServiceStatus = "connecting" | "online" | "reconnecting";

interface LogFeedContextValue {
  readonly status: ServiceStatus;
  readonly entries: readonly LogEntry[];
}

const LogFeedContext = createContext<LogFeedContextValue | null>(null);

// Quante righe tenere lato client prima di scartare le più vecchie
const MAX_ENTRIES = 1000;

export function LogFeedProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  const [entries, setEntries] = useState<readonly LogEntry[]>([]);
  const wasOnline = useRef(false);

  useEffect(() => {
    const subscription = trpc.logs.tail.subscribe(
      {},
      {
        onData: (envelope) => {
          const entry = envelope.data;
          setEntries((prev) => {
            const next = prev.length >= MAX_ENTRIES ? prev.slice(prev.length - MAX_ENTRIES + 1) : prev.slice();
            next.push(entry);
            return next;
          });
        },
        onConnectionStateChange: (state) => {
          if (state.state === "pending") {
            wasOnline.current = true;
            setStatus("online");
          } else if (state.state === "connecting") {
            setStatus(wasOnline.current ? "reconnecting" : "connecting");
          }
        },
        onError: () => {
          setStatus(wasOnline.current ? "reconnecting" : "connecting");
        },
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return <LogFeedContext.Provider value={{ status, entries }}>{children}</LogFeedContext.Provider>;
}

export function useLogFeed(): LogFeedContextValue {
  const ctx = useContext(LogFeedContext);
  if (!ctx) throw new Error("useLogFeed must be used within a LogFeedProvider");
  return ctx;
}
