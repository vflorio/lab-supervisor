import { type ActivityEntry, activityKey } from "@supervisor/core/activity/model";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc/client";

export type ServiceStatus = "connecting" | "online" | "reconnecting";

interface ActivityContextValue {
  readonly status: ServiceStatus;
  // Ultimo stato noto per ogni (source, entityId), chiave = activityKey(entry)
  readonly table: ReadonlyMap<string, ActivityEntry>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  const [table, setTable] = useState<ReadonlyMap<string, ActivityEntry>>(new Map());
  const wasOnline = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    // Stessa cautela di usePredicates: la snapshot iniziale va attesa prima di avviare la
    // subscription, altrimenti risolvendo dopo un aggiornamento di `tail` sovrascriverebbe
    // la tabella con dati più vecchi.
    trpc.activity.snapshot.query().then((entries) => {
      if (cancelled) return;
      setTable(new Map(entries.map((entry) => [activityKey(entry), entry])));

      const subscription = trpc.activity.tail.subscribe(
        {},
        {
          onData: (envelope) => {
            const entry = envelope.data;
            setTable((prev) => {
              const next = new Map(prev);
              next.set(activityKey(entry), entry);
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

  return <ActivityContext.Provider value={{ status, table }}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within an ActivityProvider");
  return ctx;
}
