import type { RecoveryStatusEntry } from "@supervisor/core/recovery/status";
import { recoveryKey } from "@supervisor/core/recovery/status";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc/client";

export type ServiceStatus = "connecting" | "online" | "reconnecting";

interface RecoveryContextValue {
  readonly status: ServiceStatus;
  // Ultimo stato noto per ogni (policy, domain, entityId, tripwireIndex), chiave = recoveryKey(entry)
  readonly table: ReadonlyMap<string, RecoveryStatusEntry>;
}

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  const [table, setTable] = useState<ReadonlyMap<string, RecoveryStatusEntry>>(new Map());
  const wasOnline = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    // Stessa cautela di usePredicates/useActivity: la snapshot iniziale va attesa prima di
    // avviare la subscription, altrimenti risolvendo dopo un aggiornamento di `tail`
    // sovrascriverebbe la tabella con dati più vecchi.
    trpc.recovery.snapshot.query().then((entries) => {
      if (cancelled) return;
      setTable(new Map(entries.map((entry) => [recoveryKey(entry), entry])));

      const subscription = trpc.recovery.tail.subscribe(
        {},
        {
          onData: (envelope) => {
            const entry = envelope.data;
            setTable((prev) => {
              const next = new Map(prev);
              next.set(recoveryKey(entry), entry);
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

  return <RecoveryContext.Provider value={{ status, table }}>{children}</RecoveryContext.Provider>;
}

export function useRecovery(): RecoveryContextValue {
  const ctx = useContext(RecoveryContext);
  if (!ctx) throw new Error("useRecovery must be used within a RecoveryProvider");
  return ctx;
}

// Tripwire di (domain, entityId) il cui ultimo esito è "exhausted": intervento manuale
// necessario prima che possa ripartire (vedi RecoveryIntervention.tsx per badge + reset).
export function useRecoveryIntervention(domain: string, entityId: string): readonly RecoveryStatusEntry[] {
  const { table } = useRecovery();
  return Array.from(table.values()).filter(
    (entry) => entry.domain === domain && entry.entityId === entityId && entry.outcome === "exhausted",
  );
}
