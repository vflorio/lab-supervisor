import type { NotifyEvent } from "@supervisor/core/notify/stream";
import { useSnackbar } from "notistack";
import { type ReactNode, useEffect } from "react";
import { trpc } from "../trpc/client";

// -------------------------------------------------------------------------------------
// Notify toaster - stesso pattern di useFacts.tsx (interrogare lo stato iniziale
// PRIMA di avviare la subscription), ma qui l'interrogazione iniziale serve solo a
// scoprire `lastEventId`: passarlo a `tail` fa sì che il backlog storico non venga rigiocato
// come toast al primo mount, mostrando solo notifiche realmente nuove.
// -------------------------------------------------------------------------------------

const variantFor = (event: NotifyEvent): "warning" | "error" => (event.lifecycle === "exhausted" ? "error" : "warning");

export function NotifyToaster(): ReactNode {
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    trpc.notify.latest.query().then((lastEventId) => {
      if (cancelled) return;

      const subscription = trpc.notify.tail.subscribe(
        { lastEventId },
        {
          onData: (envelope) => {
            const event = envelope.data;
            enqueueSnackbar(`${event.channel}: ${event.message}`, { variant: variantFor(event) });
          },
        },
      );

      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enqueueSnackbar]);

  return null;
}
