import type { Logger } from "@supervisor/core/logger/logger";
import type { Services } from "@supervisor/core/trpc";
import { initTRPC } from "@trpc/server";

export interface Context {
  readonly services: Services;
  readonly logger: Logger;
  readonly isLocalhost: boolean;
}

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
export const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;

const loggedProcedure = t.procedure.use(
  t.middleware(async ({ path, type, input, next, ctx, meta }) => {
    const endpoint = `${type} ${path} ${input || meta ? JSON.stringify({ input, meta }) : ""}`.trim();

    ctx.logger.info(`-> ${endpoint}`)();

    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;

    if (result.ok) {
      ctx.logger.info(`<- ${endpoint} <- OK (${ms}ms)`)();
    } else {
      ctx.logger.error(`<- ${endpoint} <- ERROR (${ms}ms)`)();
    }

    return result;
  }),
);

export const publicProcedure = loggedProcedure;
