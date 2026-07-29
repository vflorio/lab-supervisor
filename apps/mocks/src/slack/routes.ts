import type { SlackStore } from "./store";

// -------------------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------------------

export interface SlackRoutesConfig {
  readonly botToken: string;
}

// -------------------------------------------------------------------------------------
// Auth
// -------------------------------------------------------------------------------------

function checkBearerAuth(req: Request, botToken: string): boolean {
  const header = req.headers.get("Authorization");
  return header === `Bearer ${botToken}`;
}

// -------------------------------------------------------------------------------------
// Router
// -------------------------------------------------------------------------------------

export function slackRoutes(
  store: SlackStore,
  config: SlackRoutesConfig,
): (req: Request) => Response | Promise<Response> | null {
  return (req) => {
    const url = new URL(req.url);
    const path = url.pathname;

    // Admin: inspect messages (no auth)
    if (req.method === "GET" && path === "/_admin/slack/messages") {
      const channel = url.searchParams.get("channel") ?? undefined;
      return Response.json(store.getMessages(channel));
    }

    // Slack API routes
    if (!path.startsWith("/slack/")) return null;

    if (!checkBearerAuth(req, config.botToken)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slackPath = path.replace("/slack", "");

    if (req.method === "POST" && slackPath === "/chat.postMessage") {
      return handlePostMessage(store, req);
    }

    return null;
  };
}

// -------------------------------------------------------------------------------------
// Handlers
// -------------------------------------------------------------------------------------

async function handlePostMessage(store: SlackStore, req: Request): Promise<Response> {
  const body = (await req.json()) as { channel?: string; text?: string; blocks?: any[] };
  if (!body.channel || !body.text) {
    return Response.json({ ok: false, error: "invalid_arguments" });
  }
  const msg = store.addMessage(body.channel, body.text, body.blocks);
  return Response.json({ ok: true, ts: msg.timestamp, channel: msg.channel });
}
