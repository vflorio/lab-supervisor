import type { LoopEntry } from "@supervisor/core/task-runner/model";
import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Loops router (heartbeat dei loop di background - live tail, SSE-based subscription)
// -------------------------------------------------------------------------------------

export const loopsRouter = router({
  // Ultimo stato noto per ogni loop
  snapshot: publicProcedure.query(({ ctx }) => ctx.services.loops.snapshot()),

  // Live tail: un valore per transizione, non uno storico - niente `tracked()`/lastEventId,
  // un heartbeat non ha backlog da riprodurre (vedi android.devicesTail per lo stesso spirito).
  tail: publicProcedure.subscription(async function* ({ ctx, signal }): AsyncGenerator<LoopEntry> {
    const abortSignal = signal ?? new AbortController().signal;
    const feed = ctx.services.loops;

    const queue: LoopEntry[] = [];
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
          if (entry) yield entry;
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
