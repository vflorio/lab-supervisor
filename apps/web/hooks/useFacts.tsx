import { type FactEntry, factKey } from "@supervisor/core/fact/model";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc/client";

export type ServiceStatus = "connecting" | "online" | "reconnecting";

interface FactsContextValue {
  readonly status: ServiceStatus;
  // Tabella corrente dei fatti di monitoring, chiave = factKey(domain, entityId, name)
  readonly table: ReadonlyMap<string, FactEntry>;
}

const FactsContext = createContext<FactsContextValue | null>(null);

export function FactsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  const [table, setTable] = useState<ReadonlyMap<string, FactEntry>>(new Map());
  const wasOnline = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    // La snapshot iniziale va attesa PRIMA di avviare la subscription: altrimenti, se la query
    // risolve dopo che `tail` ha già consegnato aggiornamenti più recenti, il successivo
    // setTable(snapshot) sovrascriverebbe per intero la tabella con dati più vecchi, congelando
    // la UI su valori stale nonostante `tail` mostri gli aggiornamenti corretti.
    trpc.tracking.snapshot.query().then((entries) => {
      if (cancelled) return;
      setTable(new Map(entries.map((entry) => [factKey(entry), entry])));

      const subscription = trpc.tracking.tail.subscribe(
        {},
        {
          onData: (envelope) => {
            const entry = envelope.data;
            setTable((prev) => {
              const next = new Map(prev);
              next.set(factKey(entry), entry);
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

      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return <FactsContext.Provider value={{ status, table }}>{children}</FactsContext.Provider>;
}

export function useFacts(): FactsContextValue {
  const ctx = useContext(FactsContext);
  if (!ctx) throw new Error("useFacts must be used within a FactsProvider");
  return ctx;
}
