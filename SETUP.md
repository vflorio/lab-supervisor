
## Prerequisites

Install [bun](https://bun.sh/) (this repo is pinned to `bun@1.3.14` via `packageManager`):

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
bun install
```

## Environment variables

`tokenId`/`tokenPassword`/`botToken` are read from the process env at startup and merged into the config in memory. 
The service fails fast at boot if any of these are missing:

| Env var | Used for |
| --- | --- |
| `SUITEST_TOKEN_ID` | Suitest Public API basic auth (paired with `SUITEST_TOKEN_PASSWORD`) |
| `SUITEST_TOKEN_PASSWORD` | Suitest Public API basic auth |
| `SLACK_BOT_TOKEN` | Slack bot token used to post recovery notifications |

Two env files, both in `apps/service/`:

- **`.env`** - dev placeholders matching the mock server's defaults (`apps/mocks/src/index.ts`). Versioned in git (not real secrets), and loaded automatically by Bun for `service:dev` - nothing to configure to work against the mocks.
- **`.env.prod`** - real credentials for the real Suitest API / Slack app. **Gitignored**, never committed. `service:start` (used with `config.lab.jsonc`) loads it explicitly via `bun --env-file=.env.prod`, so it never mixes with the `.env` dev placeholders. Create it once per machine that runs the real service (e.g. the lab Mac mini):

  ```bash
  cat > apps/service/.env.prod <<'EOF'
  SUITEST_TOKEN_ID=...
  SUITEST_TOKEN_PASSWORD=...
  SLACK_BOT_TOKEN=...
  EOF
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

Requires `SUITEST_TOKEN_ID` / `SUITEST_TOKEN_PASSWORD` / `SLACK_BOT_TOKEN` in the environment (see [Environment variables](#environment-variables)) - the service exits immediately if any is missing. `service:dev` gets these from `apps/service/.env` automatically (Bun loads it, no setup needed); `service:start` loads `apps/service/.env.prod` instead. Reads `apps/service/config/config.home.jsonc` by default (see `service:dev` script). Pass a different config with `--config <path>` or `--config-url <url>`. The tRPC/WS server listens on `127.0.0.1:3001` (`trpc.port` / `trpc.hostname` in the config).

**Web app** — the operator UI (Vike + React)

```bash
bun run --filter @supervisor/web-app web:dev
```

Serves on `http://localhost:3000` by default and talks to the service over tRPC on port `3001`.

**Mock services** — fakes the Suitest and Slack APIs for local development

```bash
bun run --filter @scheduler-fp/mock-services mock-services:start
```

Serves on `http://localhost:3002`, exposing `/v1/suitest/*` and `/v1/slack/*`, plus `/_admin/*` admin routes to reset/inspect state (see `apps/mocks/src/index.ts`). Override `SUITEST_TOKEN_ID` / `SUITEST_TOKEN_PASSWORD` / `SLACK_BOT_TOKEN` env vars if needed (defaults match the dev placeholders in [Environment variables](#environment-variables)).

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
- **Web app against the real lab**: point `suitest.baseUrl` at the real Suitest API in the config the service loads, run the service with `service:start` (loads real credentials from `apps/service/.env.prod`, see [Environment variables](#environment-variables)), then skip the mock server entirely.
- **Everything at once**: `bun run dev` from the repo root starts every workspace's `dev` script via turbo, though most apps' root `dev` script only type-checks in watch mode — use the `*:dev` scripts above (`service:dev`, `web:dev`, `mock-services:start`, `demo:dev`) to actually serve the apps.

## Deploy

Prod runs on the lab Mac mini as two `launchd` daemons (native macOS, no Docker: `adb` and
`dns-sd`/Bonjour need direct host + LAN access). The repo is synced with `git` (not rsync), the
service loads its config from a URL, and all runtime data (registry + logs) lives in a shared
macOS path outside the repo so `git pull` never overwrites it.

### Runtime data location

`config.lab.jsonc` points `registry.dbPath` and `log.path` at `/Users/Shared/lab-supervisor/`
(world-writable on macOS, created automatically on first write). Nothing lives under the repo's
`data/` dir in prod, so pulling new code never clobbers the registry or logs. `launchd` writes its
own stdout/stderr there too (`service.out.log`, `service.err.log`, `web.out.log`, `web.err.log`).

### First-time setup on the Mac mini

1. Install [bun](https://bun.sh/) and clone the repo to `/Users/macmini/lab-supervisor`.
2. Create `apps/service/.env.prod` with the real credentials (see [Environment variables](#environment-variables)).
3. Adjust the two unit files in [deploy/](deploy/) if the machine differs from the defaults:
   - `PATH` must resolve `bun`, `dns-sd` (`/usr/bin`, always present) and `adb` - check with
     `which adb` and update the `platform-tools` path (Intel Macs use `/usr/local/bin` for bun).
   - `SUPERVISOR_CONFIG_PATH` in `com.supervisor.service.plist` = the path of the config file.
   - `UserName` / `WorkingDirectory` if the repo lives elsewhere or under another user.
4. Build once and install the daemons:

   ```bash
   bun install && bun run build
   sudo cp deploy/com.supervisor.service.plist deploy/com.supervisor.web.plist /Library/LaunchDaemons/
   sudo launchctl load -w /Library/LaunchDaemons/com.supervisor.service.plist
   sudo launchctl load -w /Library/LaunchDaemons/com.supervisor.web.plist
   ```

   Both start on boot (`RunAtLoad`) and are kept alive on crash (`KeepAlive`). The service listens
   on `0.0.0.0:3001` (reachable over LAN, e.g. via the Mac mini's IP), the web UI on `:3000`.

### Redeploy (new code)

On the Mac mini, pull, rebuild and restart the daemons:

```bash
cd /Users/macmini/lab-supervisor
git pull && bun install && bun run build
sudo launchctl kickstart -k system/com.supervisor.service
sudo launchctl kickstart -k system/com.supervisor.web
```

The service also handles `SIGHUP` for a hot config reload without a full restart
(`launchctl kill -s HUP system/com.supervisor.service`).

## Android

The Android agent (`apps/android`) is signed with a single shared keystore versioned in the repo (`apps/android/keystore/supervisor-agent.p12`), not the per-machine debug keystore - see the comment on `signingConfigs` in [apps/android/app/build.gradle.kts](apps/android/app/build.gradle.kts#L23). Any machine building a release/debug APK must produce a binary signed with the *same* key, otherwise installing it forces an uninstall on every device and the `WRITE_SECURE_SETTINGS` grant is lost.

When opening `apps/android` in Android Studio for the first time, nothing needs to be configured manually: Gradle already resolves `signingConfigs.supervisor` from `build.gradle.kts` for both `debug` and `release` builds. If Android Studio's "Generate Signed Bundle / APK" wizard is used instead of a Gradle task, point it at that same file:

- Key store path: `apps/android/keystore/supervisor-agent.p12`
- Key store password: `supervisor`
- Key alias: `supervisor-agent`
- Key password: `supervisor`

These credentials are intentionally in plain text (in the repo and above) - the lab network is isolated and this key doesn't protect anything user-facing, it only keeps installs cross-machine compatible.

