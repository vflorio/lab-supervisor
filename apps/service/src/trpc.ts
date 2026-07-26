import type * as Logger from "@supervisor/core/logger";
import type { Services } from "@supervisor/core/services/services";
import * as Trpc from "@supervisor/trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import express from "express";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import { WebSocketServer } from "ws";

// -------------------------------------------------------------------------------------
// Server
// -------------------------------------------------------------------------------------

export interface Deps {
  readonly services: Services;
  readonly logger: Logger.Tagged;
  readonly port: number;
  readonly hostname: string;
}

const isLocalhostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

export const startServer = (deps: Deps) => {
  const { services, logger, port, hostname } = deps;

  const context = (requestHostname: string): Trpc.Context => ({
    services,
    logger: logger.child("http"),
    isLocalhost: isLocalhostname(requestHostname),
  });

  const app = express();
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: Trpc.appRouter,
      createContext: ({ req }) => context(req.hostname),
    }),
  );

  const server = app.listen(port, hostname);
  const wss = new WebSocketServer({ server, path: "/trpc" });
  const wsHandler = applyWSSHandler({
    wss,
    router: Trpc.appRouter,
    createContext: ({ req }) => context(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).hostname),
  });

  logger.info(`listening on http://${hostname}:${port}/trpc`)();

  return {
    stop: pipe(
      TE.tryCatch(
        async () => {
          wsHandler.broadcastReconnectNotification();
          wss.close();
          await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
        },
        (reason) => ({
          type: "ServerStopError" as const,
          message: String(reason),
        }),
      ),
      TE.flatMapIO(() => logger.info("tRPC server stopped")),
    ),
  };
};
