## Prerequisites

Install [bun](https://bun.sh/) (this repo is pinned to `bun@1.3.14` via `packageManager`):

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
bun install
```

## Working on the model

```bash
bun run test:unit      # turbo run test        — vitest across every package
bun run check-types    # turbo run check-types  — tsc --noEmit across every package
bun run format          # biome format --write
bun run lint             # biome check --write
```

Per package: `bun run --filter @lab/recovery test`, `bun run --filter @lab/recovery check-types`.

There is no app to run yet: `apps/supervisor` (composition root, ticker, HTTP) is out of scope for the
current modeling pass — see `MODEL-PROMPT.md` §9.
