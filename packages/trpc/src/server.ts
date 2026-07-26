import { router } from "./instance";

// Questi dipendono dall'instanza del router ma non possono stare in una closure
import { androidRouter } from "./routers/android";
import { registryRouter } from "./routers/device-registry";
import { logsRouter } from "./routers/logs";
import { notifyRouter } from "./routers/notify";
import { recoveryRouter } from "./routers/recovery";
import { settingsRouter } from "./routers/settings";
import { trackingRouter } from "./routers/tracking";

export * from "./instance";
export * from "./result";

// -------------------------------------------------------------------------------------
// Main App Router
// -------------------------------------------------------------------------------------

export const appRouter = router({
  android: androidRouter,
  registry: registryRouter,
  logs: logsRouter,
  notify: notifyRouter,
  recovery: recoveryRouter,
  settings: settingsRouter,
  tracking: trackingRouter,
});

export type AppRouter = typeof appRouter;

// Questo risolve il type-error:
export type { TrackedData } from "@trpc/server/unstable-core-do-not-import";
// The inferred type of 'appRouter' cannot be named without a reference to 'TrackedData' from '../node_modules/@trpc/server/dist/unstable-core-do-not-import.d-BdVSvUCr.mjs'.
// This is likely not portable. A type annotation is necessary.ts(2883)
