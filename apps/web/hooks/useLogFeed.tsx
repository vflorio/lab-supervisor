import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc/client";

export type ServiceStatus = "connecting" | "online" | "reconnecting";

interface LogFeedContextValue {
  readonly status: ServiceStatus;
  readonly entries: readonly LogEntry[];
}

const LogFeedContext = createContext<LogFeedContextValue | null>(null);

// Quante righe restano lato client dopo un taglio
const MAX_ENTRIES = 1000;

// Si taglia solo oltre questa soglia, non a ogni riga in eccesso: la cache delle altezze in
// LogViewport è indicizzata per posizione, quindi ogni scorrimento della finestra la invalida
// tutta. Scartare a blocchi la invalida una volta ogni TRIM_THRESHOLD - MAX_ENTRIES righe
// invece che ad ogni log in arrivo.
const TRIM_THRESHOLD = 1200;

// Le entry in arrivo si accumulano per questa finestra e vengono applicate in un solo render:
// ogni messaggio WebSocket è un task a sé, quindi React non li batcha tra loro e senza questo
// si paga un render completo del pannello per riga di log.
const FLUSH_INTERVAL_MS = 100;

const trimmed = (entries: LogEntry[]): LogEntry[] =>
  entries.length > TRIM_THRESHOLD ? entries.slice(entries.length - MAX_ENTRIES) : entries;

export function LogFeedProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  const [entries, setEntries] = useState<readonly LogEntry[]>([]);
  const wasOnline = useRef(false);

  useEffect(() => {
    let pending: LogEntry[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (pending.length === 0) return;

      const batch = pending;
      pending = [];
      setEntries((prev) => trimmed([...prev, ...batch]));
    };

    const subscription = trpc.logs.tail.subscribe(
      {},
      {
        onData: (envelope) => {
          pending.push(envelope.data);
          // A tab nascosta i timer sono strozzati a ~1s e il replay di una riconnessione arriva
          // tutto insieme: la coda va tenuta limitata come lo stato che andrà a produrre.
          pending = trimmed(pending);
          timer ??= setTimeout(flush, FLUSH_INTERVAL_MS);
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

    return () => {
      if (timer !== null) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return <LogFeedContext.Provider value={{ status, entries }}>{children}</LogFeedContext.Provider>;
}

export function useLogFeed(): LogFeedContextValue {
  const ctx = useContext(LogFeedContext);
  if (!ctx) throw new Error("useLogFeed must be used within a LogFeedProvider");
  return ctx;
}
