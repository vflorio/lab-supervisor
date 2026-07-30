import { useState, useEffect, type ReactNode, type CSSProperties } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: "#0d0f11",
  surface: "#141719",
  surfaceInset: "#0a0c0e",
  border: "rgba(255,255,255,0.07)",
  borderMid: "rgba(255,255,255,0.12)",
  green: "#4ade80",
  greenBg: "rgba(74,222,128,0.10)",
  greenBgHover: "rgba(74,222,128,0.18)",
  text: "#e2e4e8",
  muted: "#6b7280",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type Tone = "success" | "error" | "warning" | "info" | "disabled";
type LoopState = "running" | "idle" | "stopped" | "exhausted" | "error";
type Conn = "connecting" | "online" | "reconnecting";

interface Loop {
  readonly label: string;
  readonly state: LoopState;
  readonly iteration: number;
  readonly lastTickAt?: number;
  readonly nextTickAt?: number;
  readonly delayMs?: number;
  readonly policyLabel: string;
  readonly detail?: string;
  readonly now?: number;
}

interface Pred { readonly name: string; readonly value: boolean | string | number }
interface Act { readonly source: string; readonly status: string }

interface Camera {
  readonly id: string; readonly label: string; readonly controlled: boolean;
  readonly adbId?: string; readonly vcapId?: string;
  readonly predicates: readonly Pred[]; readonly activity: readonly Act[];
}

interface Tv {
  readonly deviceId: string; readonly label: string; readonly controlled: boolean; readonly ip?: string;
  readonly predicates: readonly Pred[]; readonly activity: readonly Act[];
  readonly cameras: readonly Camera[];
}

interface CU {
  readonly id: string; readonly label: string; readonly controlled: boolean;
  readonly predicates: readonly Pred[]; readonly activity: readonly Act[];
  readonly tvs: readonly Tv[];
}

// ─── Tone helpers ─────────────────────────────────────────────────────────────
const TONE_FG: Record<Tone, string> = {
  success: "#4ade80", error: "#ef4444", warning: "#f59e0b", info: "#3b82f6", disabled: "#6b7280",
};
const TONE_BG: Record<Tone, string> = {
  success: "rgba(74,222,128,0.14)", error: "rgba(239,68,68,0.14)",
  warning: "rgba(245,158,11,0.14)", info: "rgba(59,130,246,0.14)", disabled: "rgba(107,114,128,0.09)",
};

function predTone(name: string, val: boolean | string | number | undefined): [Tone, string] {
  if (val === undefined) return ["disabled", "unknown"];
  switch (name) {
    case "suitest_device_status":
      return val === "READY" ? ["success", "READY"] : val === "OFFLINE" ? ["error", "OFFLINE"] : ["warning", String(val)];
    case "suitest_device_in_use":
      return val ? ["warning", "in use"] : ["disabled", "available"];
    case "suitest_camera_connected":
      return val ? ["success", "online"] : ["error", "offline"];
    case "suitest_camera_recording":
      return val ? ["error", "recording"] : ["disabled", "idle"];
    case "suitest_camera_streaming":
      return val ? ["info", "streaming"] : ["disabled", "idle"];
    case "suitest_control_unit_online":
      return val ? ["success", "online"] : ["error", "offline"];
    case "adb_device_reachable":
      return val ? ["success", "reachable"] : ["error", "unreachable"];
    default:
      return ["disabled", String(val)];
  }
}

function actTone(source: string, status: string): [Tone, string] {
  if (source === "recovery") {
    if (status === "healthy") return ["success", "healthy"];
    if (status === "pending") return ["warning", "pending"];
    if (status === "recovering") return ["info", "recovering"];
    if (status === "exhausted" || status === "fatalError") return ["error", status];
    return ["disabled", status];
  }
  if (source === "adb") {
    if (status === "connected") return ["success", "connected"];
    if (status === "connecting") return ["warning", "connecting"];
    if (status.startsWith("disconnected")) return ["error", status];
    return ["disabled", status];
  }
  if (source === "manual-workflow") {
    if (status.startsWith("running:")) return ["info", status];
    if (status === "succeeded") return ["success", "succeeded"];
    if (status.startsWith("failed")) return ["error", status];
    return ["disabled", status];
  }
  return ["info", status];
}

function loopTone(s: LoopState): Tone {
  if (s === "running") return "success";
  if (s === "error" || s === "exhausted") return "error";
  return "disabled";
}
function connTone(c: Conn): Tone { return c === "online" ? "success" : "warning"; }

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtAge(ms: number): string {
  if (ms < 2000) return "just now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60000)}m ago`;
}
function fmtNext(ms: number): string {
  if (ms <= 0) return "overdue";
  if (ms < 1000) return "<1s";
  if (ms < 60000) return `in ${Math.ceil(ms / 1000)}s`;
  return `in ${Math.ceil(ms / 60000)}m`;
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function IconTv() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
    </svg>
  );
}
function IconCam() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}
function IconCu() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.5 7.27L12 2 3.5 7.27v9.46L12 22l8.5-5.27V7.27zM12 4.24l6.5 4.03v8.47L12 20.76l-6.5-4.02V8.27L12 4.24z" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}
function IconDelete() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}
function IconAdd() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 2v11h3v9l7-12h-4l4-8z" />
    </svg>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────
function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className="inline-flex items-center px-2 py-px rounded-full font-mono text-[10px] font-semibold leading-relaxed whitespace-nowrap"
      style={{ backgroundColor: TONE_BG[tone], color: TONE_FG[tone] }}
    >
      {label}
    </span>
  );
}

// ─── IndicatorPair: monoEyebrow + toned value — non-clickable read-only ────────
function Ind({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>{label}</span>
      <span className="font-mono text-[10px] font-bold leading-tight" style={{ color: TONE_FG[tone] }}>{value}</span>
    </div>
  );
}

// ─── LoopWidget ───────────────────────────────────────────────────────────────
// Clock interno solo quando `now` non è iniettato, per storie e SSR deterministici.
// L'intervallo si registra al mount e viene pulito all'unmount per non generare stato fantasma.
function LoopWidget({ label, state, iteration, lastTickAt, nextTickAt, delayMs, policyLabel, detail, now: nowProp }: Loop) {
  const [clock, setClock] = useState(() => nowProp ?? Date.now());
  useEffect(() => {
    if (nowProp !== undefined) { setClock(nowProp); return; }
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nowProp]);

  const tone = loopTone(state);
  const lastAge = lastTickAt !== undefined ? clock - lastTickAt : undefined;
  const nextIn = nextTickAt !== undefined ? nextTickAt - clock : undefined;
  const progress = delayMs && nextIn !== undefined ? Math.max(0, Math.min(1, 1 - nextIn / delayMs)) : undefined;

  return (
    <div
      className="flex flex-col gap-2.5 p-3 rounded-lg shrink-0 w-44"
      style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest leading-snug" style={{ color: T.muted }}>{label}</span>
        <Pill label={state} tone={tone} />
      </div>

      {progress !== undefined && (
        <div className="h-px rounded-full overflow-hidden" style={{ backgroundColor: T.border }}>
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%`, backgroundColor: TONE_FG[tone] }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>TICK</div>
          <div className="font-mono text-xs font-bold" style={{ color: T.text }}>#{iteration}</div>
        </div>
        {lastAge !== undefined && (
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>LAST</div>
            <div className="font-mono text-[11px]" style={{ color: T.muted }}>{fmtAge(lastAge)}</div>
          </div>
        )}
        {nextIn !== undefined && (
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>NEXT</div>
            <div className="font-mono text-[11px]" style={{ color: nextIn < 0 ? T.warning : T.text }}>{fmtNext(nextIn)}</div>
          </div>
        )}
      </div>

      <div className="font-mono text-[9px] truncate" style={{ color: T.muted }}>{policyLabel}</div>
      {detail && <div className="font-mono text-[10px] truncate" style={{ color: T.muted }}>{detail}</div>}

      {state === "running" && (
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full loop-pulse" style={{ backgroundColor: T.green }} />
          <span className="font-mono text-[9px]" style={{ color: T.green }}>LIVE</span>
        </div>
      )}
    </div>
  );
}

// ─── ServiceStrip: barra dei vital sign in cima alla pagina ──────────────────
interface SuitestGroup { cameras: Loop; controlUnits: Loop; devices: Loop }
interface StripProps {
  connection: Conn; androidBridge: Loop; adb: Loop; suitest: SuitestGroup; recovery: Loop;
}

function ServiceStrip({ connection, androidBridge, adb, suitest, recovery }: StripProps) {
  return (
    <div className="border-b px-6 py-4" style={{ borderColor: T.border, backgroundColor: T.bg }}>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>LAB SUPERVISOR</span>
        <Pill label={connection} tone={connTone(connection)} />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-0.5">
        <LoopWidget {...androidBridge} />
        <LoopWidget {...adb} />

        {/* Suitest: tre polling indipendenti raggruppati sotto un unico heading */}
        <div
          className="flex flex-col gap-2.5 p-3 rounded-lg shrink-0 w-52"
          style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}
        >
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.muted }}>SUITEST TRACKING</span>
          <div className="flex flex-col gap-2 border-t pt-2.5" style={{ borderColor: T.border }}>
            {([suitest.cameras, suitest.controlUnits, suitest.devices] as Loop[]).map((loop, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: loop fisso, nessun id disponibile
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px]" style={{ color: T.muted }}>{loop.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px]" style={{ color: T.muted }}>#{loop.iteration}</span>
                  <Pill label={loop.state} tone={loopTone(loop.state)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <LoopWidget {...recovery} />
      </div>
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
function PageHeader({ cus, onAdd }: { cus: readonly CU[]; onAdd: () => void }) {
  const totalTvs = cus.reduce((s, c) => s + c.tvs.length, 0);
  const totalCams = cus.reduce((s, c) => c.tvs.reduce((s2, t) => s2 + t.cameras.length, s), 0);
  const controlled = cus.reduce(
    (s, c) =>
      s +
      (c.controlled ? 1 : 0) +
      c.tvs.reduce((s2, t) => s2 + (t.controlled ? 1 : 0) + t.cameras.filter((cam) => cam.controlled).length, 0),
    0,
  );

  return (
    <div className="flex items-start justify-between px-6 py-4 border-b" style={{ borderColor: T.border }}>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: T.muted }}>REGISTRY</div>
        <div className="font-mono text-lg font-bold leading-tight" style={{ color: T.text }}>Device Registry</div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="font-mono text-[11px]" style={{ color: T.muted }}>
            {cus.length} control units · {totalTvs} TVs · {totalCams} cameras
          </span>
          <Pill label={`${controlled} controlled`} tone="success" />
        </div>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[11px] font-semibold transition-opacity hover:opacity-90"
        style={{ backgroundColor: T.green, color: "#0a0c0e" }}
      >
        <IconAdd /> Add device
      </button>
    </div>
  );
}

// ─── CSS grid subgrid constants ───────────────────────────────────────────────
// La colonna leading assorbe l'indentazione; le altre rimangono allineate via subgrid.
const GRID_COLS = "minmax(200px,310px) auto minmax(min-content,1fr) 188px 68px";

// Subgrid comune a ogni riga e wrapper annidato; gridColumn 1/-1 copre tutte le colonne.
const SG: CSSProperties = { display: "grid", gridTemplateColumns: "subgrid", gridColumn: "1 / -1" };

// ─── Row button: azione cliccabile — separata visivamente dagli indicatori ────
function RowBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[10px] px-2 py-0.5 rounded border whitespace-nowrap transition-colors"
      style={{ borderColor: T.border, color: T.muted }}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderMid; (e.currentTarget as HTMLButtonElement).style.color = T.text; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.color = T.muted; }}
    >
      {children}
    </button>
  );
}

function IconBtn({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <button
      title={title}
      className="p-1.5 rounded transition-colors"
      style={{ color: T.muted }}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.color = T.text; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = T.muted; }}
    >
      {children}
    </button>
  );
}

// ─── CameraRow ────────────────────────────────────────────────────────────────
function CameraRow({ cam }: { cam: Camera }) {
  const pm = Object.fromEntries(cam.predicates.map((p) => [p.name, p.value]));
  const [connT, connTxt] = predTone("suitest_camera_connected", pm["suitest_camera_connected"]);
  const [recT, recTxt] = predTone("suitest_camera_recording", pm["suitest_camera_recording"]);
  const [strmT, strmTxt] = predTone("suitest_camera_streaming", pm["suitest_camera_streaming"]);
  const [adbT, adbTxt] = predTone("adb_device_reachable", pm["adb_device_reachable"]);

  const recovAct = cam.activity.find((a) => a.source === "recovery");
  const adbAct = cam.activity.find((a) => a.source === "adb");

  return (
    <div style={{ ...SG, alignItems: "center", columnGap: 12, borderTop: `1px solid ${T.border}` }} className="py-2">
      {/* Leading — il padding è sul contenuto della cella, non sul wrapper, così le altre colonne rimangono allineate */}
      <div className="flex items-center gap-2 min-w-0">
        <input type="checkbox" checked={cam.controlled} readOnly className="w-3.5 h-3.5 shrink-0 accent-green-400" />
        <span className="shrink-0" style={{ color: T.muted }}><IconCam /></span>
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-medium truncate" style={{ color: T.text }}>{cam.label}</div>
          {cam.adbId && (
            <div className="font-mono text-[10px] truncate" style={{ color: T.muted }}>{cam.adbId}</div>
          )}
        </div>
      </div>

      {/* Indicators — read-only, visivamente distinti dai bottoni */}
      <div className="flex items-center gap-3 flex-wrap">
        <Ind label="CONN" value={connTxt} tone={connT} />
        <Ind label="REC" value={recTxt} tone={recT} />
        <Ind label="STREAM" value={strmTxt} tone={strmT} />
        <Ind label="ADB" value={adbTxt} tone={adbT} />
      </div>

      {/* Context: attività live corrente */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {recovAct && (() => { const [t, txt] = actTone("recovery", recovAct.status); return <Pill label={`recovery · ${txt}`} tone={t} />; })()}
        {adbAct && (() => { const [t, txt] = actTone("adb", adbAct.status); return <Pill label={`adb · ${txt}`} tone={t} />; })()}
      </div>

      {/* Actions — cliccabili */}
      <div className="flex items-center justify-end gap-1">
        <RowBtn><span className="flex items-center gap-1"><IconLink />{cam.adbId ? "Change ADB" : "Assign ADB"}</span></RowBtn>
        <RowBtn><span className="flex items-center gap-1"><IconBolt />Workflow</span></RowBtn>
      </div>

      {/* Edit / Delete */}
      <div className="flex items-center justify-end">
        <IconBtn title="Rinomina"><IconEdit /></IconBtn>
        <IconBtn title="Rimuovi"><IconDelete /></IconBtn>
      </div>
    </div>
  );
}

// ─── TvRow ────────────────────────────────────────────────────────────────────
function TvRow({ tv, expanded, onToggle }: { tv: Tv; expanded: boolean; onToggle: () => void }) {
  const pm = Object.fromEntries(tv.predicates.map((p) => [p.name, p.value]));
  const [statusT, statusTxt] = predTone("suitest_device_status", pm["suitest_device_status"]);
  const [inUseT, inUseTxt] = predTone("suitest_device_in_use", pm["suitest_device_in_use"]);
  const recovAct = tv.activity.find((a) => a.source === "recovery");
  const wfAct = tv.activity.find((a) => a.source === "manual-workflow");

  return (
    <div style={{ ...SG, alignItems: "center", columnGap: 12, borderTop: `1px solid ${T.border}` }} className="py-2">
      <div className="flex items-center gap-2 min-w-0">
        <input type="checkbox" checked={tv.controlled} readOnly className="w-3.5 h-3.5 shrink-0 accent-green-400" />
        <span className="shrink-0" style={{ color: T.muted }}><IconTv /></span>
        <div className="min-w-0">
          <div className="font-mono text-[12px] font-medium truncate" style={{ color: T.text }}>{tv.label}</div>
          {tv.ip && <div className="font-mono text-[10px] truncate" style={{ color: T.muted }}>{tv.ip}</div>}
        </div>
        {tv.cameras.length > 0 && (
          <button
            onClick={onToggle}
            className="ml-1 font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0 transition-colors"
            style={{ color: T.muted, border: `1px solid ${T.border}` }}
            title={expanded ? "Comprimi" : "Espandi camera"}
          >
            {expanded ? "▲" : "▼"} {tv.cameras.length}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Ind label="STATUS" value={statusTxt} tone={statusT} />
        <Ind label="IN USE" value={inUseTxt} tone={inUseT} />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {recovAct && (() => { const [t, txt] = actTone("recovery", recovAct.status); return <Pill label={`recovery · ${txt}`} tone={t} />; })()}
        {wfAct && (() => { const [t, txt] = actTone("manual-workflow", wfAct.status); return <Pill label={txt} tone={t} />; })()}
      </div>

      <div className="flex items-center justify-end gap-1">
        <RowBtn><span className="flex items-center gap-1"><IconCam />Link camera</span></RowBtn>
        <RowBtn><span className="flex items-center gap-1"><IconBolt />Workflow</span></RowBtn>
      </div>

      <div className="flex items-center justify-end">
        <IconBtn title="Rinomina"><IconEdit /></IconBtn>
        <IconBtn title="Rimuovi"><IconDelete /></IconBtn>
      </div>
    </div>
  );
}

// ─── CURow ────────────────────────────────────────────────────────────────────
function CURow({ cu }: { cu: CU }) {
  const pm = Object.fromEntries(cu.predicates.map((p) => [p.name, p.value]));
  const [onlineT, onlineTxt] = predTone("suitest_control_unit_online", pm["suitest_control_unit_online"]);
  const recovAct = cu.activity.find((a) => a.source === "recovery");

  return (
    <div style={{ ...SG, alignItems: "center", columnGap: 12 }} className="py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <input type="checkbox" checked={cu.controlled} readOnly className="w-3.5 h-3.5 shrink-0 accent-green-400" />
        <div
          className="w-6 h-6 rounded flex items-center justify-center shrink-0"
          style={{ backgroundColor: T.greenBg, color: T.green }}
        >
          <IconCu />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold truncate" style={{ color: T.text }}>{cu.label}</div>
          <div className="font-mono text-[10px] truncate" style={{ color: T.muted }}>{cu.id}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Ind label="ONLINE" value={onlineTxt} tone={onlineT} />
        <Ind label="TVS" value={String(cu.tvs.length)} tone="disabled" />
      </div>

      <div className="flex items-center gap-1.5">
        {recovAct && (() => { const [t, txt] = actTone("recovery", recovAct.status); return <Pill label={`recovery · ${txt}`} tone={t} />; })()}
      </div>

      <div className="flex items-center justify-end gap-1">
        <RowBtn>Settings</RowBtn>
      </div>

      <div className="flex items-center justify-end">
        <IconBtn title="Rinomina"><IconEdit /></IconBtn>
        <IconBtn title="Rimuovi"><IconDelete /></IconBtn>
      </div>
    </div>
  );
}

// ─── CUCard ───────────────────────────────────────────────────────────────────
// Una card per ogni control unit; il grid root è qui, le righe TV/camera lo ereditano via subgrid.
// I wrapper TV e camera usano paddingLeft + borderLeft: il padding mangia la sola colonna leading,
// le altre colonne restano allineate al root grid perché ereditate via subgrid.
function CUCard({ cu }: { cu: CU }) {
  const [expandedTvs, setExpandedTvs] = useState<Set<string>>(
    () => new Set(cu.tvs.map((t) => t.deviceId)),
  );

  function toggleTv(id: string) {
    setExpandedTvs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Stili wrapper condivisi — pl + borderLeft mangiano il leading, le altre colonne non si spostano
  const tvWrap: CSSProperties = {
    ...SG,
    paddingLeft: 20,
    borderLeft: `2px solid ${T.border}`,
    marginLeft: 28,
  };
  const camWrap: CSSProperties = {
    ...SG,
    paddingLeft: 20,
    borderLeft: `2px solid ${T.border}`,
    marginLeft: 20,
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
      <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: T.border, backgroundColor: "#0d0f11" }}>
        <div className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: T.greenBg, color: T.green }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.5 7.27L12 2 3.5 7.27v9.46L12 22l8.5-5.27V7.27z" />
          </svg>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>CONTROL UNIT</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: GRID_COLS, overflowX: "auto" }} className="px-4">
        <CURow cu={cu} />

        {cu.tvs.map((tv) => {
          const expanded = expandedTvs.has(tv.deviceId);
          return (
            <div key={tv.deviceId} style={tvWrap}>
              <TvRow tv={tv} expanded={expanded} onToggle={() => toggleTv(tv.deviceId)} />

              {expanded && tv.cameras.length > 0 && (
                <div style={camWrap}>
                  {tv.cameras.map((cam) => (
                    <CameraRow key={cam.id} cam={cam} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── UnlinkedSection ──────────────────────────────────────────────────────────
function UnlinkedSection({ tvs, cameras }: { tvs: readonly Tv[]; cameras: readonly Camera[] }) {
  const [open, setOpen] = useState(false);
  const total = tvs.length + cameras.length;
  if (total === 0) return null;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        style={{ backgroundColor: T.surface }}
      >
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: T.muted }}>
          UNLINKED — {total} {total === 1 ? "device" : "devices"}
        </span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: T.muted }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: GRID_COLS, overflowX: "auto", backgroundColor: "#0d0f11" }} className="px-4">
          {tvs.map((tv) => <TvRow key={tv.deviceId} tv={tv} expanded={false} onToggle={() => {}} />)}
          {cameras.map((cam) => <CameraRow key={cam.id} cam={cam} />)}
        </div>
      )}
    </div>
  );
}

// ─── Sample data — solo qui, mai nei componenti ───────────────────────────────
const NOW = Date.now();

const STRIP: StripProps = {
  connection: "online",
  androidBridge: {
    label: "AndroidBridge", state: "running", iteration: 842,
    lastTickAt: NOW - 3100, nextTickAt: NOW + 1900, delayMs: 5000,
    policyLabel: "constant 5s", detail: "reconciled 3 cameras",
  },
  adb: {
    label: "ADB tracking", state: "running", iteration: 1203,
    lastTickAt: NOW - 8200, nextTickAt: NOW + 11800, delayMs: 20000,
    policyLabel: "constant 20s",
  },
  suitest: {
    cameras: { label: "cameras", state: "running", iteration: 234, policyLabel: "constant 30s" },
    controlUnits: { label: "ctrl-units", state: "running", iteration: 234, policyLabel: "constant 30s" },
    devices: { label: "devices", state: "idle", iteration: 0, policyLabel: "constant 30s" },
  },
  recovery: {
    label: "Recovery engine", state: "running", iteration: 56,
    lastTickAt: NOW - 1800, nextTickAt: NOW + 3200, delayMs: 5000,
    policyLabel: "constant 5s", detail: "all tripwires healthy",
  },
};

const SAMPLE_CUS: readonly CU[] = [
  {
    id: "candybox-01", label: "candybox-01", controlled: true,
    predicates: [{ name: "suitest_control_unit_online", value: true }],
    activity: [{ source: "recovery", status: "healthy" }],
    tvs: [
      {
        deviceId: "tv-001", label: "Samsung QN85B Lab-A", controlled: true, ip: "192.168.1.101",
        predicates: [
          { name: "suitest_device_status", value: "READY" },
          { name: "suitest_device_in_use", value: false },
        ],
        activity: [{ source: "recovery", status: "healthy" }],
        cameras: [
          {
            id: "cam-001", label: "cam-lab-a-01", controlled: true,
            adbId: "192.168.1.201:5555", vcapId: "vcap-001",
            predicates: [
              { name: "suitest_camera_connected", value: true },
              { name: "suitest_camera_recording", value: false },
              { name: "suitest_camera_streaming", value: false },
              { name: "adb_device_reachable", value: true },
            ],
            activity: [
              { source: "recovery", status: "healthy" },
              { source: "adb", status: "connected" },
            ],
          },
          {
            id: "cam-002", label: "cam-lab-a-02", controlled: true,
            adbId: "192.168.1.202:5555",
            predicates: [
              { name: "suitest_camera_connected", value: false },
              { name: "suitest_camera_recording", value: false },
              { name: "suitest_camera_streaming", value: false },
              { name: "adb_device_reachable", value: false },
            ],
            activity: [
              { source: "recovery", status: "recovering" },
              { source: "adb", status: "disconnected (ECONNREFUSED)" },
            ],
          },
        ],
      },
      {
        deviceId: "tv-002", label: "LG C2 Lab-B", controlled: true, ip: "192.168.1.102",
        predicates: [
          { name: "suitest_device_status", value: "OFFLINE" },
          { name: "suitest_device_in_use", value: false },
        ],
        activity: [{ source: "recovery", status: "pending" }],
        cameras: [
          {
            id: "cam-003", label: "cam-lab-b-01", controlled: false,
            predicates: [
              { name: "suitest_camera_connected", value: false },
              { name: "suitest_camera_recording", value: false },
              { name: "suitest_camera_streaming", value: false },
              { name: "adb_device_reachable", value: false },
            ],
            activity: [{ source: "adb", status: "connecting" }],
          },
        ],
      },
    ],
  },
  {
    id: "candybox-02", label: "candybox-02", controlled: true,
    predicates: [{ name: "suitest_control_unit_online", value: true }],
    activity: [{ source: "recovery", status: "healthy" }],
    tvs: [
      {
        deviceId: "tv-003", label: "Sony A80K Lab-C", controlled: true, ip: "192.168.1.103",
        predicates: [
          { name: "suitest_device_status", value: "READY" },
          { name: "suitest_device_in_use", value: true },
        ],
        activity: [
          { source: "recovery", status: "healthy" },
          { source: "manual-workflow", status: "succeeded" },
        ],
        cameras: [
          {
            id: "cam-004", label: "cam-lab-c-01", controlled: true,
            adbId: "192.168.1.204:5555",
            predicates: [
              { name: "suitest_camera_connected", value: true },
              { name: "suitest_camera_recording", value: true },
              { name: "suitest_camera_streaming", value: true },
              { name: "adb_device_reachable", value: true },
            ],
            activity: [
              { source: "recovery", status: "healthy" },
              { source: "adb", status: "connected" },
            ],
          },
        ],
      },
      {
        deviceId: "tv-004", label: "Philips OLED 806", controlled: false, ip: "192.168.1.104",
        predicates: [
          { name: "suitest_device_status", value: "READY" },
          { name: "suitest_device_in_use", value: false },
        ],
        activity: [],
        cameras: [],
      },
    ],
  },
];

const UNLINKED_CAMERAS: readonly Camera[] = [
  {
    id: "cam-orphan-01", label: "tablet-extra-01", controlled: false,
    adbId: "192.168.1.210:5555",
    predicates: [
      { name: "suitest_camera_connected", value: false },
      { name: "suitest_camera_recording", value: false },
      { name: "suitest_camera_streaming", value: false },
      { name: "adb_device_reachable", value: true },
    ],
    activity: [],
  },
];

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg }}>
      <ServiceStrip {...STRIP} />
      <PageHeader cus={SAMPLE_CUS} onAdd={() => {}} />
      <div className="px-6 py-4 flex flex-col gap-3">
        {SAMPLE_CUS.map((cu) => (
          <CUCard key={cu.id} cu={cu} />
        ))}
        <UnlinkedSection tvs={[]} cameras={UNLINKED_CAMERAS} />
      </div>
    </div>
  );
}
