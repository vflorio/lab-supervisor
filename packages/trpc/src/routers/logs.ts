import type { LogEntry } from "@supervisor/core/logger/log-stream";
import type { Logger } from "@supervisor/core/logger/logger";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Logs router (live tail, SSE-based subscription; record = Web -> Service)
// -------------------------------------------------------------------------------------

// Sottoinsieme di LogLevel effettivamente invocabile su `Logger`
// (fatal/trace/silent non sono metodi dell'interfaccia, sono solo livelli di soglia)
type ClientLogLevel = keyof Logger;
const CLIENT_LOG_LEVELS = new Set<ClientLogLevel>(["debug", "info", "warn", "error"]);

export interface LogRecordInput {
  readonly level: ClientLogLevel;
  readonly message: string;
}

const logRecordInput = (value: unknown): LogRecordInput => {
  if (typeof value !== "object" || value === null) throw new Error("Expected a log record object");

  const { level, message } = value as Record<string, unknown>;
  if (typeof message !== "string" || message.length === 0) throw new Error("Expected a non-empty message string");
  if (typeof level !== "string" || !CLIENT_LOG_LEVELS.has(level as ClientLogLevel)) {
    throw new Error("Expected level to be one of debug|info|warn|error");
  }

  return { level: level as ClientLogLevel, message };
};

export interface LogTailInput {
  readonly lastEventId?: string;
}

const logTailInput = (value: unknown): LogTailInput => {
  if (value == null) return {};
  if (typeof value !== "object") throw new Error("Expected log tail input to be an object");

  const lastEventId = (value as Record<string, unknown>).lastEventId;
  if (lastEventId != null && typeof lastEventId !== "string") {
    throw new Error("Expected lastEventId to be a string");
  }

  return { lastEventId: lastEventId ?? undefined };
};

// Quante righe di backlog inviare a un client che si collega per la prima volta (senza lastEventId)
const HISTORY_REPLAY_SIZE = 200;

export const logsRouter = router({
  // Registra nel logger di servizio (tag "web") un'azione dispatchata dalla web-app, così
  // che nei log risulti chiaramente che è stato l'utente a scatenarla e non un tick automatico
  record: publicProcedure.input(logRecordInput).mutation(({ ctx, input }) => {
    ctx.services.logger[input.level](input.message)();
  }),

  tail: publicProcedure.input(logTailInput).subscription(async function* ({
    ctx,
    input,
    signal,
  }): AsyncGenerator<TrackedEnvelope<LogEntry>> {
    const abortSignal = signal ?? new AbortController().signal;
    const feed = ctx.services.logs;
    const history = feed.history();

    const startIndex = input.lastEventId
      ? history.findIndex((entry) => String(entry.id) === input.lastEventId) + 1
      : Math.max(0, history.length - HISTORY_REPLAY_SIZE);

    for (const entry of history.slice(startIndex)) {
      yield tracked(String(entry.id), entry);
    }

    const queue: LogEntry[] = [];
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
