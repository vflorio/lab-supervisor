import type { AppRouter } from "@supervisor/trpc/server";
import { createTRPCProxyClient, createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";

const getBaseUrl = () => (typeof window !== "undefined" ? "" : `http://localhost:${import.meta.env.PORT ?? 3000}`);

const url = `${getBaseUrl()}/api/trpc`;

const wsClient = createWSClient({
  url: () =>
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/trpc`
      : `ws://localhost:${import.meta.env.PORT ?? 3000}/api/trpc`,
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
