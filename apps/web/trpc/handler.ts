import type { Logger } from "@supervisor/core/logger/logger";
import type { Services } from "@supervisor/core/trpc";
import type * as Trpc from "@supervisor/trpc/server";
import { appRouter } from "@supervisor/trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { enhance, type Get, type UniversalHandler } from "@universal-middleware/core";

export const trpcHandler = ((endpoint: string, services: Services, logger: Logger) =>
  enhance(
    (request, _context, _runtime) => {
      const url = new URL(request.url);
      const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";

      return fetchRequestHandler({
        endpoint,
        req: request,
        router: appRouter,
        createContext(): Trpc.Context {
          return {
            services,
            logger,
            isLocalhost,
          };
        },
      });
    },
    {
      name: "my-app:trpc-handler",
      path: `${endpoint}/**`,
      method: ["GET", "POST"],
      immutable: false,
    },
  )) satisfies Get<[endpoint: string, services: Services, logger: Logger], UniversalHandler>;
