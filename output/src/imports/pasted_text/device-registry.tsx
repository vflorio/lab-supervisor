# Brief: Device Registry page — pure UI components for `lab-supervisor`

You are designing and writing production React components that must drop into an **existing**
codebase with minimal rework on our side. You cannot see that codebase — so everything you need is
reproduced verbatim in this brief: the theme (§3), the domain types you must create (§6), and the
primitive components you must reuse (§11).

Everything specified here resolves from public npm packages, so **your output should actually render
in a live preview**. If something doesn't render, fix it *within* these constraints — never by
swapping in a different library or styling system.

The attached screenshots are from this same app. Read the whole brief before writing code. There is a
required "Assumptions" section at the end.

---

## 0. Read this first — the failure modes we expect from you

You are likely optimised to produce a self-contained React + Tailwind + shadcn/ui app. **That output
is unusable here.** Specifically, do **not**:

- generate a `components/ui/` folder, or any shadcn/Radix/Headless-UI primitive (`button.tsx`,
  `card.tsx`, `badge.tsx`, …). Our primitives already exist — §11 gives you their full source.
- emit Tailwind classes, a `globals.css`, an `index.css`, a `tailwind.config`, or `className` of any
  kind. Styling is MUI's `sx` prop, exclusively.
- import `lucide-react`. Icons come from `@mui/icons-material`.
- scaffold an app shell you weren't asked for: no router, no mock API, no README, no design-system
  documentation page. A single throwaway preview/demo entry that mounts the components is fine and
  welcome, but it is **not** a deliverable — mark it clearly as such.
- use `figma:asset/…` imports, `ImageWithFallback`, Unsplash URLs, or any placeholder image. There
  are no images in this UI — only icons, text and shape.
- import `@supervisor/core`, `@supervisor/ui`, or any other `@supervisor/*` package. Those are our
  private local packages and will not resolve for you. §6 replaces them.
- invent module paths. Every import must be either a package from §2's table or a relative path to a
  file you are creating (or one given in §6 / §11).

---

## 1. What the app is

`lab-supervisor` supervises a physical device lab: TVs, Android cameras/tablets, and control units
("candybox"). A background service continuously polls several subsystems, derives *predicates*
(named facts about entities), runs *recovery* automations when a predicate goes bad, and streams all
of it to the web app over a live socket.

Two pages matter here:

- **Settings** (most of the attached screenshots) — already built in the pattern we want: pure,
  documented, generic components in a shared UI package, wired to data only in the app.
  **This is the visual and structural reference. Match it.**
- **Device Registry** (the dark row-based list screenshot) — the page you are redesigning.
  **We are discarding that implementation.** Keep exactly two ideas from it:
  1. the **hierarchical indentation** (control unit → TV → camera, nested and visually indented);
  2. the **column alignment** across sibling rows at different nesting depths.
  Everything else — spacing, density, information architecture, how live state is presented — is
  yours to redesign, in the Settings visual language.

---

## 2. Hard constraints — dependencies

| Allowed | Notes |
| --- | --- |
| `react` 19.2 | function components + hooks. The React Compiler is enabled in our build — do **not** hand-write `useMemo`/`useCallback` for performance. |
| `@mui/material` 9.2 | `Box`, `Stack`, `Typography`, `Paper`, `Chip`, `Button`, `IconButton`, `Switch`, `Checkbox`, `Divider`, `Tooltip`, `LinearProgress`, `CircularProgress`, `ToggleButton`/`ToggleButtonGroup`, `Dialog`, `TextField`, `Autocomplete`, `Menu`/`MenuItem`, `Alert` |
| `@mui/icons-material` 9.2 | the only icon source |
| `@emotion/react`, `@emotion/styled` 11 | MUI's engine — you touch it only indirectly via `sx` |
| `ts-pattern` 5.9 | `match(x).with(…).exhaustive()` — preferred for discriminated unions |
| `@storybook/react` 10.5 | **optional**, see the story rules in §5 |

**Forbidden, no exceptions:** any `@supervisor/*` package · Tailwind or any utility-class CSS ·
shadcn/ui, Radix, Headless UI, Chakra, Ant, Mantine · `lucide-react` or any other icon set ·
`framer-motion` / `react-spring` / `gsap` · `clsx` / `cva` / `tailwind-merge` · `styled-components` ·
`date-fns` / `dayjs` / `moment` · `zod` · `lodash` · `fp-ts` / `io-ts` · `recharts` / `d3` /
`chart.js` · `react-router` · any `.css` / `.module.css` / `<style>` tag · `react-icons` · SVG sprite
files · web font `<link>`s.

Styling is **`sx` only**: no `styled()`, no `makeStyles`, no `className`, no `style={{}}`. (You will
see one legacy `styled()` call in §11's `FieldLabel` — that is history, not a licence.) Never
hardcode a colour that isn't in the theme; use theme paths (`"primary.main"`, `"text.secondary"`,
`"divider"`, …). The only literal hexes allowed are the two "recessed surface" values already used in
our code: `#0a0c0e` (inset field/code background) and `#0d0f11` (expanded-panel background).

Two fonts are referenced by the theme: `Inter` and `JetBrains Mono`. Assume they are loaded globally.
Do **not** add font links, `@font-face` rules, or a font loader — if they fall back to system fonts in
your preview, that is acceptable.

---

## 3. The theme — this file already exists, verbatim

`packages/ui/src/theme.ts`. Import from it as `import { monoFontFamily } from "../theme";`.
Never create your own theme, and never wrap a component in a `ThemeProvider` — the app provides it
globally. (A throwaway preview entry may wrap the tree once; a *component* may not.)

```ts
import { createTheme } from "@mui/material/styles";
import type { CSSProperties } from "react";

export const monoFontFamily = "'JetBrains Mono', monospace" as const;

declare module "@mui/material/styles" {
  interface TypographyVariants {
    monoEyebrow: CSSProperties;
    monoLabel: CSSProperties;
    monoTitle: CSSProperties;
    monoCode: CSSProperties;
    emphasizedValue: CSSProperties;
  }
  interface TypographyVariantsOptions {
    monoEyebrow?: CSSProperties;
    monoLabel?: CSSProperties;
    monoTitle?: CSSProperties;
    monoCode?: CSSProperties;
    emphasizedValue?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    monoEyebrow: true;
    monoLabel: true;
    monoTitle: true;
    monoCode: true;
    emphasizedValue: true;
  }
}

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0d0f11", paper: "#141719" },
    primary: { main: "#4ade80", contrastText: "#0a0c0e" },
    secondary: { main: "#1c1f22" },
    warning: { main: "#f59e0b" },
    info: { main: "#3b82f6" },
    error: { main: "#ef4444" },
    text: { primary: "#e2e4e8", secondary: "#6b7280" },
    divider: "rgba(255,255,255,0.07)",
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    button: { textTransform: "none", fontFamily: monoFontFamily },
    monoEyebrow: { fontFamily: monoFontFamily, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" },
    monoLabel: { fontFamily: monoFontFamily, fontSize: 10 },
    monoTitle: { fontFamily: monoFontFamily, fontSize: 12 },
    monoCode: { fontFamily: monoFontFamily, fontSize: 11, lineHeight: 1.7 },
    emphasizedValue: { fontSize: 13, lineHeight: 1.4, fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none", border: "1px solid rgba(255,255,255,0.07)" } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.07)",
          color: "#6b7280",
          fontFamily: monoFontFamily,
          fontSize: 11,
          padding: "3px 10px",
          "&.Mui-selected": {
            color: "#4ade80",
            backgroundColor: "rgba(74,222,128,0.15)",
            borderColor: "rgba(74,222,128,0.3)",
          },
          "&.Mui-selected:hover": { backgroundColor: "rgba(74,222,128,0.2)" },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontFamily: monoFontFamily, fontSize: 10, height: 20, borderRadius: 4 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontFamily: monoFontFamily,
          fontSize: 12,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.07)" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.15)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(74,222,128,0.5)" },
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontFamily: monoFontFamily, fontSize: 12 } } },
    MuiButton: {
      styleOverrides: { root: { fontFamily: monoFontFamily, fontSize: 11 }, sizeSmall: { padding: "3px 10px" } },
    },
    MuiMenuItem: { styleOverrides: { root: { fontFamily: monoFontFamily, fontSize: 12 } } },
  },
});
```

### How to use the typography scale

Use these variants instead of ad-hoc `fontSize` / `letterSpacing`:

| variant | what it is | use for |
| --- | --- | --- |
| `monoEyebrow` | mono 10px, uppercase, `letterSpacing: .1em` | the small label above a value — "DOMAIN", "ADB STATUS", "TRIPWIRE" |
| `monoLabel` | mono 10px | secondary inline mono text |
| `monoTitle` | mono 12px | entity names, identifiers |
| `monoCode` | mono 11px, `lineHeight: 1.7` | code / JSON / log lines |
| `emphasizedValue` | 13px, `fontWeight: 700` | the value under a `monoEyebrow` |

Body text is Inter 13px (`body2` / `caption` for secondary). The eyebrow+value pair is the signature
device of this UI: a `monoEyebrow` label with an `emphasizedValue` (or a toned status word)
underneath. Reuse it heavily.

### Density and surface rules

This is an operator dashboard that lives on a wall: dense, calm, no decoration.

- Cards: `Paper variant="outlined"` with `p: 2.5`. Card header uses the eyebrow+title pattern with a
  28×28 rounded icon tile: `bgcolor: "rgba(74,222,128,0.1)"`, `color: "primary.main"`,
  `borderRadius: 1`.
- `Stack` gaps of `1`–`1.5` inside a card; `2` between cards.
- Nested/expanded blocks: `bgcolor: "#0d0f11"`, `borderTop`/`border: "1px solid"`,
  `borderColor: "divider"`, `p: 1.5`.
- Inset read-only field boxes: `bgcolor: "#0a0c0e"`, `border: "1px solid"`,
  `borderColor: "divider"`, `borderRadius: 1`, `px: 1.5`, `py: 1`.
- Tree indentation: `pl: 3` + `borderLeft: "2px solid"`, `borderColor: "divider"` on the wrapper —
  **never** a background fill or a card-in-card.
- Green (`primary.main`) is the accent and means "healthy / active / controlled". Do not use it for
  decoration, or its signal value dies.

---

## 4. Architecture — the whole point of this task

Three layers. **You write layers A and B only.**

**A. Generic primitives** — zero domain knowledge; the caller supplies label, tone, icon, children.
Several already exist and you **must reuse them rather than reinvent** — full source in §11:
`StatusPill`, `DetailGrid`, `DomainCardHeader`, `DomainCardAccordion`, `JsonView`, `EntryRow`.
You may add new primitives if something is genuinely missing.

The one shared colour vocabulary, used everywhere. **Do not invent a new palette or new tone names:**

```ts
export type StatusTone = "success" | "error" | "warning" | "info" | "disabled";
```

**B. Per-domain viewers** — one small, isolated, *pure* component per domain / predicate / live
process. This is the core requirement: **every domain, predicate and process gets its own dedicated
visualiser**, which owns the mapping from that domain's state to a `StatusTone` + a human label, and
renders through layer-A primitives. It takes the domain state as **props** (typed from §6) and
returns JSX. Nothing else.

**C. Wiring — we write it, not you.** In the web app each layer-B viewer gets bound to live
socket-fed state. So: never subscribe, fetch, poll, read a context, or reference the app.

### Purity contract — a component that breaks this is rejected

- No `fetch` / `axios` / WebSocket / API client / `useContext` of an app provider. No hook that
  produces data (`useDevices`, `useActivityFeed`, …) — not even a stubbed one.
- All data in via props. All user intent out via props named `onX` (`onToggle`, `onEdit`,
  `onDelete`, `onRunWorkflow`, `onResetRecovery`). No navigation, no `window.*`.
- `useState` is allowed **only** for view-local, non-domain state: expand/collapse, hovered row,
  which menu is open. Anything an operator would call "data" is a prop.
- `useEffect` only to sync view-local state to a prop (e.g. auto-expand the row named by
  `focusLabel`). One further exception for timers — see §7.
- No `Date.now()` / `new Date()` / `Math.random()` during render (it breaks SSR — the app is
  server-rendered — and makes output non-deterministic). If you need "now", take it as an optional
  prop `now?: number` — see §7.
- The props interface is exported, named `<Component>Props`, every field `readonly`, arrays typed
  `readonly T[]`. Optional means optional: render a legitimate empty/unknown state, never throw.
  **"No data yet" is a valid state, not an error** — an entity that has produced no activity yet is
  simply `idle` / `unknown`.

Sample/mock data belongs in stories or in the throwaway preview entry — **never** as a default prop
value, a module-level fallback, or a hardcoded fixture inside a component.

---

## 5. File & code conventions

- One component per file, `PascalCase.tsx`, in a folder per domain: `packages/ui/src/<domain>/`.
- Every folder has an `index.tsx` barrel containing only `export * from "./Component";` lines.
- **Named function export.** No `default export`, no `React.FC`, no arrow-function components.
- Props destructured in the signature, defaults there (`indicators = []`).
- Suffix conventions: `View` = read-only render; `Form` = controlled editor (`value` +
  `onChange(next)`, immutable updates: `onChange({ ...value, grace })`). This task is mostly `View`s.
- Formatting (Biome): 2-space indent, double quotes, semicolons, **max 120 chars per line**.
  Import order: `@mui/icons-material`, `@mui/material`, other packages, then relative —
  alphabetical within each group, `import type` for type-only imports.
- TypeScript strict, no `any`. Closed discriminated unions → `ts-pattern` `.exhaustive()`.
  Open-ended string statuses (predicate/activity statuses are open-ended) → `switch` with a
  `default`, or prefix matching where §6 says so.
- List keys: prefer a real id. When a readonly domain type genuinely has none, use the index **with**
  our suppression comment: `// biome-ignore lint/suspicious/noArrayIndexKey: <reason in Italian>`

### Exemplar — a read-only viewer (our house style, adapted to §6's local types)

```tsx
import { Divider, Stack, Typography } from "@mui/material";
import type { RecoveryPolicy } from "../domain/types";
import { RecoveryTripwireView } from "./RecoveryTripwireView";

// Readonly: label + domain + tripwire in ordine, separati da un divider.
export interface RecoveryPolicyViewProps {
  readonly value: RecoveryPolicy;
}

export function RecoveryPolicyView({ value }: RecoveryPolicyViewProps) {
  return (
    <Stack sx={{ gap: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {value.label}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {value.domain}
        </Typography>
      </Stack>
      {value.tripwires.map((tripwire, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: RecoveryTripwire non ha id, sola lettura
        <Stack key={index} sx={{ gap: 1 }}>
          {index > 0 && <Divider />}
          <RecoveryTripwireView value={tripwire} />
        </Stack>
      ))}
    </Stack>
  );
}
```

### Stories — optional, best effort

Storybook is **nice to have, not required**. We can write the stories ourselves. So:

- If you are confident in the format, ship a `Component.stories.tsx` beside each component using
  exactly the shape below.
- If you are not — or if `@storybook/react` doesn't resolve in your environment — **omit the stories
  entirely** and say so in the Assumptions section. Do not invent a different story format, do not
  fall back to Storybook 6/7 syntax, and above all do not let stories compromise the components:
  a clean component with no story beats a component bent to fit a story runner.
- Never delete or rename a component to make stories work.

The exact shape, if you do ship them (CSF3, Storybook 10 — **no decorators, no `ThemeProvider`, no
`argTypes`, no `parameters`, no `play` functions, no MSW**; a global preview decorator already
supplies theme + `CssBaseline`, and zero Storybook addons are installed):

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import type { RecoveryPolicy } from "../domain/types";
import { RecoveryPolicyView } from "./RecoveryPolicyView";

const meta: Meta<typeof RecoveryPolicyView> = {
  title: "Recovery/RecoveryPolicyView",
  component: RecoveryPolicyView,
};

export default meta;
type Story = StoryObj<typeof RecoveryPolicyView>;

const policyWithTripwire: RecoveryPolicy = {
  label: "adb_camera_recovery",
  domain: "adb",
  tripwires: [{ grace: "30s", predicateName: "suitest_camera_connected", workflowName: "wake_and_check" }],
};

export const WithTripwire: Story = { args: { value: policyWithTripwire } };
export const Empty: Story = { args: { value: { label: "empty", domain: "test", tripwires: [] } } };
```

`title` is `"<Domain>/<Component>"`. Sample payloads are module-level consts with realistic values
(real predicate names, real IPs, real statuses — see §6). Cover the states that matter: nominal,
degraded, error, empty/unknown, and long-label truncation. If you skip stories, put those same
sample payloads in the throwaway preview entry instead, so the states are still visible.

### Comment style — we are strict about this

Short comments, **1–3 lines, in Italian, directly above the declaration they explain**, saying *why* /
what invariant holds — not what the code literally does. **No `// ------` banner blocks** (you will
see them in §11's older files; they are legacy, do not copy that style). No JSDoc, no
`@param`/`@returns`, no end-of-line commentary, no commented-out code. Comment the non-obvious: why a
column is fixed-width, why "no entry yet" means idle, why one tone is reused for two states. Roughly
one comment per exported symbol plus a couple inside — not more.

---

## 6. Domain types — create this one file, then import only from it

Our real domain types live in a private package you can't resolve, and they carry runtime validation
machinery (io-ts codecs, `Option`-wrapped foreign keys) that has no business in a pure UI component.
So: **flatten them into a single UI-boundary module and put every domain declaration there.**

Create `packages/ui/src/domain/types.ts` with exactly this content. It is plain TypeScript — zero
dependencies — so it resolves and renders anywhere:

```ts
// Tipi di confine della UI: forme piatte e serializzabili che rispecchiano i modelli del servizio.
// Le foreign key opzionali del dominio reale sono Option-wrapped; qui restano `?: string` e la
// conversione avviene nel wiring, così i componenti non conoscono la libreria di validazione.

export type ActivitySource = "recovery" | "adb" | "workflow" | "manual-workflow";

// "Cosa sta facendo un sottosistema per questa entità adesso", una riga per (source, entityId).
export interface ActivityEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly entityId: string;
  readonly source: ActivitySource;
  // Riga leggibile, es. "pending", "running", "connected"
  readonly status: string;
}

export const activityKey = (entry: Pick<ActivityEntry, "source" | "entityId">): string =>
  `${entry.source}:${entry.entityId}`;

// Il valore di un predicato è tipizzato, non solo booleano, per rappresentare anche stati a più
// valori (es. lo status enum di un device) senza derivare N booleani distinti.
export type PredicateValue = boolean | string | number;

export const TRACKED_DOMAINS = ["adb", "suitest-camera", "suitest-control-unit", "suitest-device"] as const;
export type TrackedDomain = (typeof TRACKED_DOMAINS)[number];

// Un fatto nominato su un'entità di un dominio monitorato.
export interface PredicateFact {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
  readonly value: PredicateValue;
}

export interface PredicateEntry extends PredicateFact {
  readonly id: number;
  readonly timestamp: number;
}

// Host = target la cui porta non è ancora nota; Endpoint = target ADB completo.
export interface Host {
  readonly ip: string;
}

export interface Endpoint {
  readonly ip: string;
  readonly port: number;
}

export const formatEndpoint = (target: Endpoint): string => `${target.ip}:${target.port}`;

// Ciclo di vita della connessione ADB di una camera Android: una istanza per camera controlled.
export type AndroidBridgeState =
  | { readonly _tag: "Connecting"; readonly id: string; readonly host: Host }
  | { readonly _tag: "Idle"; readonly id: string; readonly target: Endpoint }
  | { readonly _tag: "Disconnecting"; readonly id: string; readonly host: Host }
  | { readonly _tag: "Disconnected"; readonly id: string; readonly host: Host; readonly reason: string };

// Solo Idle ha una connessione utilizzabile e accetta comandi verso il device.
export const acceptsCommands = (state: AndroidBridgeState): boolean => state._tag === "Idle";

export type DurationString = `${number}${"ms" | "s" | "m" | "h"}`;

// Control unit (CandyBox): identità = id Suitest, non esiste indipendentemente da Suitest.
export interface ControlUnitEntry {
  readonly id: string;
  readonly label: string;
  readonly controlled: boolean;
}

// TV: identità = deviceId Suitest; `ip` è un dato secondario, può mancare.
export interface TvEntry {
  readonly deviceId: string;
  readonly label: string;
  readonly controlled: boolean;
  readonly ip?: string;
}

// Camera (device Android su ADB): identità locale stabile, perché una camera Suitest non ha IP e
// l'host ADB associato può essere riassegnato. Le due FK sono opzionali: una camera aggiunta a
// mano (es. un tablet) può non averle.
export interface CameraEntry {
  readonly id: string;
  readonly label: string;
  readonly controlled: boolean;
  readonly videoCaptureDeviceId?: string;
  readonly adbId?: string;
}

// Target ADB registrato manualmente: `id` coincide con la forma stringa del target.
export interface AdbEntry {
  readonly id: string;
  readonly label: string;
  readonly target: Endpoint;
}

// Stato di un loop di background (vedi §7) e stato della connessione al servizio.
export type LoopState = "running" | "idle" | "stopped" | "exhausted" | "error";
export type ServiceConnection = "connecting" | "online" | "reconnecting";
```

**Rules about this file:**

- Every domain type you need lives **here and nowhere else**. No domain interface declared inside a
  component file, no duplicated shape, no `type Foo = { … }` inline in props. Component-specific
  view types (`XProps`, a local union describing a rendering choice) stay in the component — the
  distinction is: does it describe *the lab*, or *the widget*?
- You may **add** to it if §6.1–6.3 or your design needs a shape that isn't here (e.g. a
  `RecoveryPolicy` / `RecoveryTripwire` shape as used in §5's exemplar, or a per-loop descriptor).
  Adding is expected; list each addition under Assumptions.
- Do not add runtime validation, classes, factories, or helper logic beyond the two trivial
  functions above.

This is the single point of contact between your output and our codebase: we swap this one file for
our real imports and everything else compiles.

Entity hierarchy: **control unit (candybox)** → **TV** → **camera** (an Android device reached over
ADB, optionally linked to a Suitest *video capture device*). Unlinked / orphan entities exist and
must render — the current page has an "Unlinked" section; keep the concept.

### 6.1 Predicates — exact names, values and tones

A predicate is a named fact about an entity: `(domain, entityId, name) → value`.

| domain | predicate name | value | tone / text |
| --- | --- | --- | --- |
| `suitest-device` | `suitest_device_status` | `"READY"` \| `"OFFLINE"` \| other string | READY→`success`, OFFLINE→`error`, other→`warning` |
| `suitest-device` | `suitest_device_in_use` | boolean (+ who: email / org name / token name) | true→`warning` ("in use by …"), false→`disabled` ("available") |
| `suitest-camera` | `suitest_camera_connected` | boolean | true→`success` "online", false→`error` "offline" |
| `suitest-camera` | `suitest_camera_recording` | boolean | true→`error` "active", false→`disabled` "idle" |
| `suitest-camera` | `suitest_camera_streaming` | boolean | true→`info` "active", false→`disabled` "idle" |
| `suitest-control-unit` | `suitest_control_unit_online` | boolean | true→`success` "online", false→`error` "offline" |
| `adb` | `adb_device_reachable` | boolean | true→`success` "reachable", false→`error` "unreachable" |

`undefined` **always** means "not observed yet" → tone `disabled`, text `"unknown"`. Never blank.

### 6.2 Activity — "what is a subsystem doing to this entity right now"

One row per `(source, entityId)`. Statuses are strings, some carrying a variable suffix:

- **`recovery`** — the tripwire state machine: `"healthy"`→`success` · `"pending"`→`warning` ·
  `"recovering"`→`info` · `"exhausted"` and `"fatalError"`→`error` (both terminal, both need manual
  operator intervention, hence the same tone) · missing→`disabled`.
- **`adb`** — the android-bridge FSM for a camera: `"connected"`→`success` ·
  `"connecting"`→`warning` · `"disconnected (<reason>)"`→`error` (**prefix match** — the reason is
  appended) · missing→`disabled`.
- **`manual-workflow`** — the last operator-launched workflow: `"running:<name>"`→`info` ·
  `"succeeded"`→`success` · `"failed: <message>"`→`error` (prefix matches) · missing→`disabled`.

A viewer that receives the real `AndroidBridgeState` union (rather than that flattened string) should
`match` on `_tag`: `Connecting` (has `host`) · `Idle` (connected, has `target`, the only state that
accepts commands) · `Disconnecting` (has `host`) · `Disconnected` (has `host` + `reason`).

### 6.3 Operator actions available on a row

Toggle "controlled by supervisor" (checkbox), rename, delete, assign/change the ADB target, link a
Suitest camera, launch a configured workflow from a list, reset a stuck recovery tripwire. Model each
as an `onX` prop; a row renders only the actions its props permit — e.g. no ADB target assigned →
"Assign ADB" instead of "Change ADB" + "Launch workflow".

---

## 7. The centrepiece: live-loop (heartbeat) visualisers

Every recurring background process in the service is the same generic engine: it calls `onTick`
repeatedly, and the delay before the next tick comes from a retry policy — either a constant delay,
or an exponential backoff capped at a maximum, optionally with a retry limit. Its whole state is
`{ iteration, previousDelay }`; a policy that returns no delay means **exhausted** → the loop stops.

Design **one generic loop visualiser**: a compact widget that makes a live process legible at a
glance — is it alive, where is it in its cycle, when does it fire next, how long are its intervals, is
it stalled or exhausted. Think "heartbeat / pulse / cycle", not "chart". Then apply it to four
instances.

**Available information** (name the props as you see fit; it is all plain serialisable data — the
widget computes nothing it isn't given):

```
label        string      e.g. "AndroidBridge reconcile"
state        LoopState   "running" | "idle" | "stopped" | "exhausted" | "error"  (§6)
iteration    number      tick counter since start
lastTickAt   number?     epoch ms of the last tick (may never have ticked)
nextTickAt   number?     epoch ms the next tick is due
delayMs      number?     the delay the policy returned for the current cycle
policyLabel  string      human summary, e.g. "constant 5s", "exp 1s → cap 30s"
detail       string?     last outcome line
now          number?     injected clock — see below
```

**Timer rule — the only allowed exception to §4.** To animate a countdown or cycle progress, the
widget may own a `useState` + `setInterval` that advances a *display* clock derived from the
timestamps already in its props. It never fetches, never mutates domain state, and clears the
interval on unmount. It must accept an optional `now` prop that, when provided, **fully overrides**
the internal clock, so stories and server rendering stay deterministic. Document that in a two-line
Italian comment. Any animation is a CSS keyframe via `sx` (`"@keyframes …"`) — no animation library.
Keep it subtle: this dashboard is on a wall all day, a throbbing element is a liability. Honour
`@media (prefers-reduced-motion: reduce)`.

Apply the generic widget to these four, each as its own thin domain viewer — they differ in label,
cadence semantics and what "unhealthy" means, and that mapping is the viewer's job:

1. **AndroidBridge reconcile** — fixed 5s tick; re-reads the registry and reconciles every
   controlled camera's ADB connection. This is the loop that *makes devices connected*.
2. **ADB tracking** — configurable policy; feeds the connected-device state everything else reads
   (`adb_device_reachable`).
3. **Suitest tracking** — configurable policy, **three independent pollings**: cameras, control
   units, devices. Present them as three loops grouped under one heading, not one merged loop.
4. **Recovery engine** — evaluates tripwires and drives recovery pipelines.

These live in a **header strip at the top of the registry page**: the service's vital signs, above
the device tree. Design that strip too — the composition of the four, plus the overall
`ServiceConnection` state (§6).

---

## 8. Hierarchy & alignment requirements for the device tree

- Three nesting levels, visually indented with `pl: 3` + `borderLeft` on the wrapper. Nesting depth
  must require **no JS bookkeeping**.
- Sibling rows at *different* depths must still align their columns. We do this with **CSS grid
  `subgrid`**: one ancestor establishes `gridTemplateColumns`, and every nesting wrapper *and* every
  row continues it with `gridTemplateColumns: "subgrid"; gridColumn: "1 / -1"`. Keep this technique —
  it is why indentation only ever eats into the leading column. §11's `EntryRow` is the working
  implementation, with the reasoning for each column width in its comments.
- Existing column model, as a starting point — improve it if your design is better, but say so:
  `leading (checkbox + icon + label/secondary) | indicators (read-only status pairs) | context (per-kind live info) | actions (clickable) | edit+delete`,
  template `minmax(160px, 300px) auto minmax(min-content, 1fr) 160px 76px`, with `overflowX: auto` on
  the grid root so a narrow viewport scrolls instead of garbling.
- Long labels truncate (`noWrap`) rather than stretching a column.
- **Read-only indicators must be instantly distinguishable from clickable actions.** In the current
  page they aren't — that's one of the reasons we're rebuilding it. Solve this deliberately.
- Zone order is fixed by the container, so callers cannot interleave zones.
- The page also needs a header (title, device counts, "N controlled" badge, add-device action) in the
  Settings visual language.

---

## 9. Deliverables

For each component: the `.tsx`, its folder's `index.tsx` barrel, and — if you're shipping them — the
`.stories.tsx`. Plus `packages/ui/src/domain/types.ts` from §6. Give every file a full repo-relative
path as a heading, then its complete contents. No `// ...unchanged`, no partial diffs, no summarised
bodies.

Target layout — adjust the names if you have a better decomposition, but keep the
one-component-per-file, one-folder-per-domain shape:

```
packages/ui/src/domain/types.ts   the single domain-type module from §6
packages/ui/src/registry/         device tree: per-kind rows, per-domain/predicate viewers, page header
packages/ui/src/task-runner/      the generic loop visualiser, the four domain applications, header strip
```

A throwaway preview/demo entry that mounts everything with sample data is welcome as an extra —
clearly labelled as not-a-deliverable, and kept out of those folders.

Then list:

1. **New export entries** for `packages/ui/package.json`, in the form
   `"./<domain>": "./src/<domain>/index.tsx"`.
2. **Assumptions** — every type you added to `domain/types.ts` and why; every deviation from §8's
   column model; whether you shipped stories; every place you were unsure. One line each,
   exhaustive. A stated assumption costs us a minute; a silent one costs us a rewrite.
3. Anything you deliberately left out, and why.

Do **not** write: web-app pages, API/networking code, data hooks, providers, tests, READMEs, a
design-system doc, your own `theme.ts`, or replacements for the §11 primitives.

---

## 10. Self-check before you answer

- [ ] Zero imports outside §2's allow-list. No `@supervisor/*`, no Tailwind, no shadcn, no
      `components/ui/`, no `lucide-react`, no `framer-motion`, no `fp-ts`, no CSS files.
- [ ] Every domain type comes from `packages/ui/src/domain/types.ts`; none is declared twice.
- [ ] Styling is `sx` only; every colour is a theme path, a `StatusTone`, or one of the two allowed
      recessed hexes.
- [ ] Text sizing goes through `monoEyebrow` / `monoLabel` / `monoTitle` / `monoCode` /
      `emphasizedValue`, not raw `fontSize`.
- [ ] No fetch / socket / data hook / context. No `Date.now()` during render (except behind `now`).
- [ ] No mock data inside a component — only in stories or the preview entry.
- [ ] Nothing from §3 or §11 has been redeclared — those files already exist.
- [ ] Every exported component has an exported `<Name>Props` with `readonly` fields.
- [ ] Comments: Italian, 1–3 lines, above the declaration, no banner blocks, no JSDoc.
- [ ] Lines ≤ 120 chars, double quotes, 2-space indent, named exports only.
- [ ] Predicate names, activity statuses and tone mappings match §6 **exactly**.
- [ ] Every domain / predicate / process has its **own** isolated viewer, and none of them knows
      where its data comes from.

---

## 11. Appendix — existing primitives, verbatim. Import these; do not rewrite them.

These files depend only on `react` and `@mui/*`, so they compile as-is in your environment. Note on
style: they carry `// -----` banner comments. That is our **legacy** style — reuse the components,
but write your own comments in the short style described in §5.

### `packages/ui/src/registry/StatusPill.tsx`

```tsx
import { Box } from "@mui/material";
import type { ReactNode } from "react";

export type StatusTone = "success" | "error" | "warning" | "info" | "disabled";

const TONE_COLORS: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: "success.main", fg: "success.contrastText" },
  error: { bg: "error.main", fg: "error.contrastText" },
  warning: { bg: "warning.main", fg: "warning.contrastText" },
  info: { bg: "info.main", fg: "info.contrastText" },
  disabled: { bg: "action.disabledBackground", fg: "text.disabled" },
};

export interface StatusPillProps {
  readonly label: string;
  readonly tone: StatusTone;
  readonly icon?: ReactNode;
}

export function StatusPill({ label, tone, icon }: StatusPillProps) {
  const { bg, fg } = TONE_COLORS[tone];

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: 999,
        bgcolor: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.8,
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
    </Box>
  );
}
```

### `packages/ui/src/registry/DetailGrid.tsx`

```tsx
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { StatusTone } from "./StatusPill";

export interface DetailItem {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: StatusTone;
}

const TONE_TEXT_COLOR: Record<StatusTone, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface DetailGridProps {
  readonly items: readonly DetailItem[];
}

export function DetailGrid({ items }: DetailGridProps) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 1.5 }}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: DetailItem non ha id, sola lettura
        <Box key={index}>
          <Typography variant="overline" color="textSecondary">
            {item.label}
          </Typography>
          <Typography variant="emphasizedValue" sx={{ color: item.tone ? TONE_TEXT_COLOR[item.tone] : "text.primary" }}>
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
```

### `packages/ui/src/misc/EntryRow.tsx` — the grid/subgrid technique

```tsx
import { Delete, Edit } from "@mui/icons-material";
import { Box, Checkbox, Divider, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

// Generic list-entry row, laid out as a CSS grid so sibling rows (CU/TV/camera/...) line up on the
// same columns no matter how deep a row sits in the tree. Zones, always in this order so callers
// can't interleave them:
//  - `indicators`: read-only status (name/value pairs, not clickable)
//  - `context`: reserved column for info specific to the entry kind (live connection progress for
//    an ADB target, active workflow for a camera)
//  - `actions`: things the user can click (chips, buttons)
// Callers nest rows visually by wrapping children in a padded/bordered Box. Every such wrapper -
// and every EntryRow itself - subgrids from the nearest ancestor that established the grid (via
// `entryRowGridSx`, once per independent list). CSS subgrid guarantees each column aligns to the
// same X across all of them; the wrapper's `pl`/`borderLeft` only ever eats into the leading
// column, because that's where the tree indentation lives - so nesting depth needs no JS.

// Leading is capped at a real length so long labels truncate (`noWrap`) instead of stretching the
// column. Indicators size to their own content (`auto`, never below min-content since they can
// flex-wrap). Context is the one flexible column (`1fr`) so it soaks up leftover space on wide
// screens. Actions and edit/delete get a fixed width so they never reflow with what a particular
// row happens to render. If nothing fits even at minimum, the root's `overflowX: auto` turns it
// into a horizontal scroll instead of clipped content.
const ENTRY_ROW_GRID_TEMPLATE_COLUMNS = "minmax(160px, 300px) auto minmax(min-content, 1fr) 160px 76px";

// Establishes the shared column grid - use once per independent list (a CU card, the unassigned
// TVs/cameras list, ...).
export const entryRowGridSx = {
  display: "grid",
  gridTemplateColumns: ENTRY_ROW_GRID_TEMPLATE_COLUMNS,
  overflowX: "auto",
};

// Continues the grid through a nesting wrapper (or the row itself) so its columns stay pinned to
// the ancestor's.
export const entryRowSubgridSx = {
  display: "grid",
  gridTemplateColumns: "subgrid",
  gridColumn: "1 / -1",
};

export interface EntryRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly secondary?: string;
  readonly checked: boolean;
  readonly checkedTitle?: string;
  readonly indicators?: ReactNode[];
  readonly context?: ReactNode;
  readonly actions?: ReactNode[];
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function EntryRow({
  icon,
  label,
  secondary,
  checked,
  checkedTitle,
  indicators = [],
  context,
  actions = [],
  onToggle,
  onEdit,
  onDelete,
}: EntryRowProps) {
  return (
    <Box sx={{ ...entryRowSubgridSx, alignItems: "center", columnGap: 1.5, py: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <Checkbox checked={checked} onChange={onToggle} size="small" title={checkedTitle} sx={{ flexShrink: 0 }} />
        <Box sx={{ color: "textSecondary", display: "flex", flexShrink: 0 }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
            {label}
          </Typography>
          {secondary && (
            <Typography variant="caption" color="textSecondary" noWrap sx={{ display: "block" }}>
              {secondary}
            </Typography>
          )}
        </Box>
      </Box>
      <Stack
        direction="row"
        spacing={1.5}
        divider={<Divider orientation="vertical" flexItem />}
        sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "flex-start" }}
      >
        {indicators}
      </Stack>
      <Box sx={{ display: "flex", alignItems: "center" }}>{context}</Box>
      <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
        {actions}
      </Stack>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <IconButton size="small" onClick={onEdit} title="Edit label">
          <Edit fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onDelete} title="Remove">
          <Delete fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
```

### `packages/ui/src/misc/DomainCardHeader.tsx` — the card header pattern

```tsx
import { Code } from "@mui/icons-material";
import { Box, Stack, Switch, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface DomainCardHeaderProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly showJson: boolean;
  readonly onToggleJson: () => void;
  readonly actions?: ReactNode;
}

export function DomainCardHeader({ icon, title, subtitle, showJson, onToggleJson, actions }: DomainCardHeaderProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 2.5 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center" }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            bgcolor: "rgba(74,222,128,0.1)",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="monoEyebrow" sx={{ color: "textSecondary", display: "block" }}>
            Domain
          </Typography>
          <Typography variant="monoTitle" sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="textSecondary" sx={{ display: "block" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
        {actions}
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Typography variant="monoLabel" sx={{ color: "textSecondary" }}>
            JSON
          </Typography>
          <Switch checked={showJson} onChange={onToggleJson} size="small" color="primary" />
          <Code sx={{ fontSize: 14, color: showJson ? "primary.main" : "textSecondary" }} />
        </Stack>
      </Stack>
    </Stack>
  );
}
```

### `packages/ui/src/misc/DomainCardAccordion.tsx` — the expand/collapse pattern

Note: there is **no MUI `Accordion` anywhere in this repo** — collapsing is always local `useState`
plus conditional rendering, exactly as here.

```tsx
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, Stack } from "@mui/material";
import type { ReactNode } from "react";

export interface DomainCardAccordionProps {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly trailing?: ReactNode;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

export function DomainCardAccordion({ icon, title, trailing, expanded, onToggle, children }: DomainCardAccordionProps) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        onClick={onToggle}
        sx={{ gap: 1.25, alignItems: "center", px: 1.5, py: 1, cursor: "pointer" }}
      >
        {icon}
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flex: 1, minWidth: 0 }}>
          {title}
        </Stack>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexShrink: 0 }}>
          {trailing}
        </Stack>
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </Stack>
      {expanded && (
        <Box sx={{ bgcolor: "#0d0f11", borderTop: "1px solid", borderColor: "divider", p: 1.5 }}>{children}</Box>
      )}
    </Box>
  );
}
```

### `packages/ui/src/misc/JsonView.tsx` — for the JSON toggle in a card header

```tsx
import { Box, Stack, Typography } from "@mui/material";

export interface JsonViewProps {
  readonly data: unknown;
}

export function JsonView({ data }: JsonViewProps) {
  return (
    <Box sx={{ bgcolor: "#0a0c0e", border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          gap: 1,
          alignItems: "center",
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "#0d0f11",
        }}
      >
        <Typography variant="monoLabel" sx={{ color: "textSecondary", ml: 1 }}>
          JSON
        </Typography>
      </Stack>
      <Box
        component="pre"
        sx={(theme) => ({ ...theme.typography.monoCode, color: "primary.main", p: 2, m: 0, overflowX: "auto" })}
      >
        {JSON.stringify(data, null, 2)}
      </Box>
    </Box>
  );
}
```

### Icon vocabulary already in use (`@mui/icons-material`)

`Tv` (TV) · `Videocam` (camera) · `Usb` (ADB target) · `Cable` (ADB bridge) · `Bolt` (recovery) ·
`PlayArrow` (workflow run) · `Security` (recovery domain) · `Link` (Suitest linking) · `Code` (JSON
toggle) · `Add` · `Edit` · `Delete` · `ExpandLess` / `ExpandMore` · `Settings`. Icons are rendered
`fontSize="small"` inline, or `sx={{ fontSize: 16 }}` in a card-header tile. Stay within this
vocabulary unless a new concept genuinely needs a new icon.
