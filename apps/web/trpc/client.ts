import type { AppRouter } from "@supervisor/trpc/server";
import { createTRPCProxyClient, createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";

// The service is reached directly (no proxy): same hostname the page was loaded from, so it
// also works over LAN when the web UI is opened via the server's IP.
const SERVICE_PORT = 3001;

const getHttpBaseUrl = () =>
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:${SERVICE_PORT}`
    : `http://localhost:${SERVICE_PORT}`;

const getWsBaseUrl = () =>
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:${SERVICE_PORT}`
    : `ws://localhost:${SERVICE_PORT}`;

const url = `${getHttpBaseUrl()}/trpc`;

const wsClient = createWSClient({
  url: () => `${getWsBaseUrl()}/trpc`,
  lazy: { enabled: true, closeMs: 0 },
});

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({ url }),
    }),
  ],
});
