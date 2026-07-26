import type { RecoveryStatusEntry } from "@supervisor/core/recovery/status";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Recovery router (transizioni di stato del motore di recovery - live tail, SSE-based
// subscription) - stessa forma di routers/tracking.ts
// -------------------------------------------------------------------------------------

export interface RecoveryTailInput {
  readonly lastEventId?: string;
}

const recoveryTailInput = (value: unknown): RecoveryTailInput => {
  if (value == null) return {};
  if (typeof value !== "object") throw new Error("Expected recovery tail input to be an object");

  const lastEventId = (value as Record<string, unknown>).lastEventId;
  if (lastEventId != null && typeof lastEventId !== "string") {
    throw new Error("Expected lastEventId to be a string");
  }

  return { lastEventId: lastEventId ?? undefined };
};

// Quante voci di backlog inviare a un client che si collega per la prima volta (senza lastEventId)
const HISTORY_REPLAY_SIZE = 200;

export interface RecoveryResetInput {
  readonly policy: string;
  readonly entityId: string;
  readonly tripwireIndex: number;
}

const recoveryResetInput = (value: unknown): RecoveryResetInput => {
  if (value == null || typeof value !== "object") throw new Error("Expected recovery reset input to be an object");

  const { policy, entityId, tripwireIndex } = value as Record<string, unknown>;
  if (typeof policy !== "string") throw new Error("Expected policy to be a string");
  if (typeof entityId !== "string") throw new Error("Expected entityId to be a string");
  if (typeof tripwireIndex !== "number") throw new Error("Expected tripwireIndex to be a number");

  return { policy, entityId, tripwireIndex };
};

export const recoveryRouter = router({
  // Ultimo stato noto per ogni (policy, domain, entityId, tripwireIndex)
  snapshot: publicProcedure.query(({ ctx }) => ctx.services.recovery.snapshot()),

  // Riarma manualmente un tripwire dopo un esaurimento dei retry (intervento manuale) - vedi
  // Services.recoveryReset. `false` se il servizio non è active o l'entità/tripwire non
  // risultano mai osservati: non un errore di programma, quindi non un throw.
  reset: publicProcedure
    .input(recoveryResetInput)
    .mutation(({ ctx, input }) => ctx.services.recoveryReset(input.policy, input.entityId, input.tripwireIndex)),

  // Live tail delle transizioni - stessa forma di trackingRouter.tail
  tail: publicProcedure.input(recoveryTailInput).subscription(async function* ({
    ctx,
    input,
    signal,
  }): AsyncGenerator<TrackedEnvelope<RecoveryStatusEntry>> {
    const abortSignal = signal ?? new AbortController().signal;
    const feed = ctx.services.recovery;
    const history = feed.history();

    const startIndex = input.lastEventId
      ? history.findIndex((entry) => String(entry.id) === input.lastEventId) + 1
      : Math.max(0, history.length - HISTORY_REPLAY_SIZE);

    for (const entry of history.slice(startIndex)) {
      yield tracked(String(entry.id), entry);
    }

    const queue: RecoveryStatusEntry[] = [];
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
