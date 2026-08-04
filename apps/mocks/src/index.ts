import * as CoreLogger from "@supervisor/core/logger/logger";
import type { BunRequest } from "bun";
import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import { slackRoutes } from "./slack/routes";
import { SlackStore } from "./slack/store";
import { suitestRoutes } from "./suitest/routes";
import { DEFAULT_DUMP_PATH, loadDumpSeed, SuitestStore } from "./suitest/store";

const PORT = Number(import.meta.env.PORT ?? 3002);

const SUITEST_TOKEN_ID = import.meta.env.SUITEST_TOKEN_ID ?? "dev-suitest-token-id";
const SUITEST_TOKEN_PASSWORD = import.meta.env.SUITEST_TOKEN_PASSWORD ?? "dev-suitest-token-password";
const SLACK_BOT_TOKEN = import.meta.env.SLACK_BOT_TOKEN ?? "dev-slack-token";

// Se impostata, serve i dati del dump reale (scripts/suitest-dump.ps1) al posto dei seed
// hardcoded di debug. Valori "1"/"true" usano il dump di default in src/suitest/dump.json,
// qualsiasi altra stringa e' trattata come percorso custom.
const SUITEST_DUMP_PATH_RAW = import.meta.env.SUITEST_DUMP_PATH;
const SUITEST_DUMP_PATH =
  SUITEST_DUMP_PATH_RAW === "1" || SUITEST_DUMP_PATH_RAW === "true" ? DEFAULT_DUMP_PATH : SUITEST_DUMP_PATH_RAW;

// -------------------------------------------------------------------------------------
// Stores
// -------------------------------------------------------------------------------------

const suitestStore = new SuitestStore(SUITEST_DUMP_PATH ? loadDumpSeed(SUITEST_DUMP_PATH) : undefined);
const slackStore = new SlackStore();

// -------------------------------------------------------------------------------------
// Service routes
// -------------------------------------------------------------------------------------

const routeSuitest = suitestRoutes(suitestStore, { tokenId: SUITEST_TOKEN_ID, tokenPassword: SUITEST_TOKEN_PASSWORD });
const routeSlack = slackRoutes(slackStore, { botToken: SLACK_BOT_TOKEN });

// -------------------------------------------------------------------------------------
// Server
// -------------------------------------------------------------------------------------

const logger = pipe(CoreLogger.createConsoleLogger("debug"), CoreLogger.tagged("Service")).child("MockServices");

const withISE = (router: (request: Request) => Response | Promise<Response> | null) => (request: BunRequest) =>
  router(request) ?? Response.json({ error: "Internal Server Error" }, { status: 500 });

// Le route "/_admin/*" sono dichiarate dentro suitestRoutes/slackRoutes ma "/_admin/*" non
// era registrato come prefisso nella routes table di Bun.serve, quindi ogni richiesta admin
// veniva intercettata dal 404 di default di Bun ancora prima di raggiungere i router
// (bug preesistente, non collegato ad alcuna route specifica).
const routeAdmin = (request: Request): Response | Promise<Response> | null =>
  routeSuitest(request) ?? routeSlack(request);

pipe(
  IO.of(
    Bun.serve({
      port: PORT,
      //fetch: route,
      routes: {
        "/": () => Response.json(["/v1/suitest/*", "/v1/slack/*"]),
        "/_admin/*": (request: BunRequest<"/_admin/*">) => withISE(routeAdmin)(request),
        "/v1/suitest/*": (request: BunRequest<"/v1/suitest/*">) => withISE(routeSuitest)(request),
        "/v1/slack/*": (request: BunRequest<"/v1/slack/*">) => withISE(routeSlack)(request),
      },
    }),
  ),
  IO.flatMap(({ port, hostname, protocol }) => logger.info(`Running on ${protocol}://${hostname}:${port}`)),
  IO.flatMap(() => logger.info(`   Suitest: /suitest/*`)),
  IO.flatMap(() => logger.info(`   Slack:   /slack/*`)),
  IO.flatMap(() =>
    logger.info(
      `   Admin:   /_admin/reset | /_admin/state | /_admin/devices/:id | /_admin/video-capture-devices/:id | /_admin/control-units/:id | /_admin/slack/messages`,
    ),
  ),
)();
