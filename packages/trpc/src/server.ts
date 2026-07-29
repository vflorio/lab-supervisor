import { router } from "./instance";

// I routers dipendono dall'instanza di tRPC (ma non possono stare in una closure)
import { activityRouter } from "./routers/activity";
import { androidRouter } from "./routers/android";
import { registryRouter } from "./routers/device-registry";
import { logsRouter } from "./routers/logs";
import { notifyRouter } from "./routers/notify";
import { recoveryRouter } from "./routers/recovery";
import { settingsRouter } from "./routers/settings";
import { trackingRouter } from "./routers/tracking";
import { workflowRouter } from "./routers/workflow";

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
  activity: activityRouter,
  workflow: workflowRouter,
});

export type AppRouter = typeof appRouter;

// Questo risolve il type-error:
// The inferred type of 'appRouter' cannot be named without a reference to 'TrackedData' from '../node_modules/@trpc/server/dist/unstable-core-do-not-import.d-BdVSvUCr.mjs'.
// This is likely not portable. A type annotation is necessary.ts(2883)
export type { TrackedData } from "@trpc/server/unstable-core-do-not-import";
