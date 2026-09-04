import * as Network from "@supervisor/core/network";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import { publicProcedure, router } from "../instance";
import * as Result from "../result";

// -------------------------------------------------------------------------------------
// Android router (ADB device management, live tail, SSE-based subscription)
// -------------------------------------------------------------------------------------

const targetInput = (value: unknown): Network.Endpoint =>
  pipe(
    Network.Codec.decode(value),
    E.getOrElseW(() => {
      throw new Error("Expected ADB target in <host>:<port> format");
    }),
  );

export const androidRouter = router({
  devices: publicProcedure.query(({ ctx }) => pipe(ctx.services.android.devices(), Result.fromTaskEither)),

  reboot: publicProcedure
    .input(targetInput)
    .mutation(({ ctx, input }) => pipe(ctx.services.android.reboot(input), Result.fromTaskEither)),

  restartServer: publicProcedure.mutation(({ ctx }) =>
    pipe(ctx.services.android.restartServer(), Result.fromTaskEither),
  ),

  // Live tail dello stato ADB degli host (raggiungibilità fisica del device, non l'app suitest-camera).
  devicesTail: publicProcedure.subscription(async function* ({
    ctx,
    signal,
  }): AsyncGenerator<readonly { target: string; status: string }[]> {
    const abortSignal = signal ?? new AbortController().signal;
    const feed = ctx.services.android.devicesFeed;

    let previous: string | undefined;

    const emitIfChanged = (devices: readonly { target: string; status: string }[]) => {
      const snapshot = JSON.stringify(devices);
      const changed = snapshot !== previous;
      previous = snapshot;
      return changed;
    };

    if (emitIfChanged(feed.snapshot())) yield feed.snapshot();

    const queue: (readonly { target: string; status: string }[])[] = [];
    let wake: (() => void) | null = null;

    const unsubscribe = feed.subscribe((devices) => {
      queue.push(devices);
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
          const devices = queue.shift();
          if (devices && emitIfChanged(devices)) yield devices;
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
