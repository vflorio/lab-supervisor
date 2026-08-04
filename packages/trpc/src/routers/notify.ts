import type { NotifyEvent } from "@supervisor/core/notify/stream";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Notify router
// (notifiche dispatchate dal motore di recovery; live tail, SSE-based subscription)
// -------------------------------------------------------------------------------------

export interface NotifyTailInput {
  readonly lastEventId?: string;
}

const notifyTailInput = (value: unknown): NotifyTailInput => {
  if (value == null) return {};
  if (typeof value !== "object") throw new Error("Expected notify tail input to be an object");

  const lastEventId = (value as Record<string, unknown>).lastEventId;
  if (lastEventId != null && typeof lastEventId !== "string") {
    throw new Error("Expected lastEventId to be a string");
  }

  return { lastEventId: lastEventId ?? undefined };
};

// Quante voci di backlog inviare a un client che si collega per la prima volta (senza lastEventId)
const HISTORY_REPLAY_SIZE = 200;

export const notifyRouter = router({
  // Id dell'ultima notifica nota, usato dal client per sottoscrivere `tail` passando questo
  // come `lastEventId` e ricevere solo notifiche nuove (senza rigiocare il backlog storico
  // come toast) - stesso principio di useFacts.tsx che attende la snapshot prima di
  // avviare la subscription.
  latest: publicProcedure.query(({ ctx }): string | undefined => {
    const history = ctx.services.notifications.history();
    const last = history[history.length - 1];
    return last ? String(last.id) : undefined;
  }),

  // Live tail delle notifiche dispatchate - stessa forma di recoveryRouter.tail
  tail: publicProcedure.input(notifyTailInput).subscription(async function* ({
    ctx,
    input,
    signal,
  }): AsyncGenerator<TrackedEnvelope<NotifyEvent>> {
    const abortSignal = signal ?? new AbortController().signal;
    const feed = ctx.services.notifications;
    const history = feed.history();

    const startIndex = input.lastEventId
      ? history.findIndex((entry) => String(entry.id) === input.lastEventId) + 1
      : Math.max(0, history.length - HISTORY_REPLAY_SIZE);

    for (const entry of history.slice(startIndex)) {
      yield tracked(String(entry.id), entry);
    }

    const queue: NotifyEvent[] = [];
    let wake: (() => void) | null = null;

    const unsubscribe = feed.subscribe((entry) => {
      queue.push(entry);
      wake?.();
    });

    abortSignal.addEventListener("abort", () => wake?.(), { once: true });

    try {
      while (!abortSignal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }

        while (queue.length > 0) {
          const entry = queue.shift();
          if (entry) yield tracked(String(entry.id), entry);
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
