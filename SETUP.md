
## Prerequisites

Install [bun](https://bun.sh/) (this repo is pinned to `bun@1.3.14` via `packageManager`):

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
bun install
```

## Development

Build all packages:

```bash
bun run build
```

Run all packages in watch mode (turbo runs every workspace's `dev` script in parallel):

```bash
bun run dev
```

Clean build artifacts:

```bash
bun run clean
```

Format code:

```bash
bun run format
```

Lint code:

```bash
bun run lint
```

Run unit / e2e tests:

```bash
bun run test:unit
bun run test:e2e
```

## Package Management

Check for version mismatches:

```bash
bun run syncpack:check
```

Fix version mismatches:

```bash
bun run syncpack:fix
```

### Running Specific Applications

Each app is run individually with `bun run --filter <package> <script>` (or `cd` into the app directory and run the script directly with `bun run <script>`).

**Service** — the recovery service (tRPC + WS server)

```bash
bun run --filter @supervisor/service service:dev
```

Reads `apps/service/config/config.home.jsonc` by default (see `service:dev` script). Pass a different config with `--config <path>` or `--config-url <url>`. The tRPC/WS server listens on `127.0.0.1:3001` (`trpc.port` / `trpc.hostname` in the config).

**Web app** — the operator UI (Vike + React)

```bash
bun run --filter @supervisor/web-app web:dev
```

Serves on `http://localhost:3000` by default and talks to the service over tRPC on port `3001`.

**Mock services** — fakes the Suitest and Slack APIs for local development

```bash
bun run --filter @scheduler-fp/mock-services mock-services:start
```

Serves on `http://localhost:3002`, exposing `/v1/suitest/*` and `/v1/slack/*`, plus `/_admin/*` admin routes to reset/inspect state (see `apps/mocks/src/index.ts`). Override `SUITEST_TOKEN_ID` / `SUITEST_TOKEN_PASSWORD` / `SLACK_BOT_TOKEN` env vars if needed (defaults match the `config.home.jsonc` dev tokens).

**Demo** — standalone UI component demo

```bash
bun run --filter @supervisor/demo demo:dev
```

**Docs**

```bash
bun run --filter @supervisor/docs docs:dev
```

Serves on `http://localhost:3010`.

### Running against Suitest on localhost

To develop without hitting the real Suitest API, point the service's config at the mock server and run everything together:

1. Set `suitest.baseUrl` to `http://localhost:3002/v1/suitest` in `apps/service/config/config.home.jsonc` (this is already the default).
2. In separate terminals:

   ```bash
   # Terminal 1 — mock Suitest/Slack API on :3002
   bun run --filter @scheduler-fp/mock-services mock-services:start

   # Terminal 2 — recovery service on :3001, using the mocked Suitest
   bun run --filter @supervisor/service service:dev

   # Terminal 3 — web UI on :3000, talking to the service
   bun run --filter @supervisor/web-app web:dev
   ```

3. Open `http://localhost:3000` for the UI. Use the mock server's `/_admin/*` routes (e.g. `/_admin/reset`, `/_admin/state`, `/_admin/devices/:id`) to seed or inspect fake device state without touching real hardware.

Other useful combinations:

- **Service + mocks only** (no UI, e.g. testing recovery workflows/logs): run just terminals 1 and 2 above, then tail `apps/service/data/logs.jsonl`.
- **Web app against the real lab**: point `suitest.baseUrl` at the real Suitest API (and set real tokens) in the config the service loads, then skip the mock server entirely.
- **Everything at once**: `bun run dev` from the repo root starts every workspace's `dev` script via turbo, though most apps' root `dev` script only type-checks in watch mode — use the `*:dev` scripts above (`service:dev`, `web:dev`, `mock-services:start`, `demo:dev`) to actually serve the apps.

