import type { LoopEntry } from "@supervisor/core/task-runner/model";
import { useEffect, useRef, useState } from "react";
import { trpc } from "../trpc/client";

export type ServiceStatus = "connecting" | "online" | "reconnecting";

export interface Loops {
  readonly status: ServiceStatus;
  // Ultimo stato noto per loop, chiave = LoopEntry["id"]
  readonly table: ReadonlyMap<string, LoopEntry>;
}

// Heartbeat dei loop di background (§7): stessa cautela snapshot-poi-subscribe di
// usePredicates/useActivity - la query iniziale va attesa prima di avviare la subscription,
// altrimenti un tail più recente verrebbe sovrascritto da uno snapshot risolto più tardi ma
// più vecchio.
export function useLoops(): Loops {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  const [table, setTable] = useState<ReadonlyMap<string, LoopEntry>>(new Map());
  const wasOnline = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    trpc.loops.snapshot.query().then((entries) => {
      if (cancelled) return;
      setTable(new Map(entries.map((entry) => [entry.id, entry])));

      const subscription = trpc.loops.tail.subscribe(undefined, {
        onData: (entry) => {
          setTable((prev) => {
            const next = new Map(prev);
            next.set(entry.id, entry);
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
      });

      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { status, table };
}
