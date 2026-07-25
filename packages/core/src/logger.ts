import type * as IO from "fp-ts/IO";
import * as t from "io-ts";
import { ANSI_RESET, LEVEL_PALETTE, TAG_PALETTE } from "./log-palette";

export interface Logger {
  readonly debug: (message: string) => IO.IO<void>;
  readonly info: (message: string) => IO.IO<void>;
  readonly warn: (message: string) => IO.IO<void>;
  readonly error: (message: string) => IO.IO<void>;

  // Traccia risposte HTTP (get/post, singole o paginate), gated dal flag `network` di
  // LogConfig invece che dal `level` configurato - non esiste un livello "verbose"
  // supportato dalla console, quindi è un interruttore indipendente, non un settimo livello.
  readonly logNetwork: (message: string) => IO.IO<void>;
}

// -------------------------------------------------------------------------------------
// Log levels
// -------------------------------------------------------------------------------------

// Configurazione logging
export const LogLevel = t.keyof({
  fatal: null,
  error: null,
  warn: null,
  info: null,
  debug: null,
  trace: null,
  silent: null,
});

export type LogLevel = t.TypeOf<typeof LogLevel>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
  silent: Infinity,
};

export const isLevelEnabled = (configured: LogLevel, target: LogLevel): boolean =>
  (LEVEL_PRIORITY[target] ?? 0) >= LEVEL_PRIORITY[configured];

// -------------------------------------------------------------------------------------
// Structured log records
//
// `color` is an intrinsic value (an index into TAG_PALETTE), not a rendering
// instruction. `message` is always plain text - no ANSI is ever baked into it.
// Each transport decides how (or whether) to render tag/color/depth.
// -------------------------------------------------------------------------------------

export interface LogRecord {
  readonly level: LogLevel;
  readonly timestamp: number;
  readonly tag?: string;
  readonly depth: number;
  readonly color?: number;
  readonly message: string;
}

export type Transport = (record: LogRecord) => void;

// -------------------------------------------------------------------------------------
// Tag colors (per-module coloring)
// -------------------------------------------------------------------------------------

let colorIndex = 0;
const moduleColorMap = new Map<string, number>();

const getModuleColor = (tag: string): number => {
  const existing = moduleColorMap.get(tag);
  if (existing !== undefined) return existing;

  const index = colorIndex % TAG_PALETTE.length;
  colorIndex++;
  moduleColorMap.set(tag, index);

  return index;
};

// -------------------------------------------------------------------------------------
// TaggedLogger [TAG] ...message
// -------------------------------------------------------------------------------------

export interface Tagged extends Logger {
  readonly child: (tag: string) => Tagged;
}

interface LoggerContext {
  readonly configuredLevel: LogLevel;
  readonly transports: readonly Transport[];
  readonly tag?: string;
  readonly depth: number;
  // Interruttore indipendente dal livello per Logger.logNetwork (vedi Config.Log.network)
  readonly network: boolean;
}

const dispatch = (ctx: LoggerContext, level: LogLevel, message: string): void => {
  const record: LogRecord = {
    level,
    timestamp: Date.now(),
    tag: ctx.tag,
    depth: ctx.depth,
    color: ctx.tag ? getModuleColor(ctx.tag) : undefined,
    message,
  };

  for (const transport of ctx.transports) transport(record);
};

const emit =
  (ctx: LoggerContext, level: LogLevel) =>
  (message: string): IO.IO<void> =>
  () => {
    if (isLevelEnabled(ctx.configuredLevel, level)) dispatch(ctx, level, message);
  };

// A differenza di `emit`, non passa da `isLevelEnabled`: è gated solo da `ctx.network`,
// così resta visibile anche quando `level` è configurato più severo (es. "warn"/"error").
// Il record emesso usa comunque "debug" come `level` (rendering/pino non hanno un livello
// "network" dedicato), quindi il filtro locale della web UI (dropdown livello) lo nasconde
// se lì si sceglie un livello minimo sopra "debug" - un controllo di visualizzazione
// indipendente da questo interruttore lato servizio.
const emitNetwork =
  (ctx: LoggerContext) =>
  (message: string): IO.IO<void> =>
  () => {
    if (ctx.network) dispatch(ctx, "debug", message);
  };

const build = (ctx: LoggerContext): Tagged => ({
  debug: emit(ctx, "debug"),
  info: emit(ctx, "info"),
  warn: emit(ctx, "warn"),
  error: emit(ctx, "error"),
  logNetwork: emitNetwork(ctx),
  child: (tag: string) => build({ ...ctx, tag, depth: ctx.tag ? ctx.depth + 1 : ctx.depth }),
});

export const tagged =
  (tag: string) =>
  (base: Tagged): Tagged =>
    base.child(tag);

// -------------------------------------------------------------------------------------
// Generic logger factory
// -------------------------------------------------------------------------------------

export const create = (level: LogLevel, transports: readonly Transport[], network = false): Tagged =>
  build({ configuredLevel: level, transports, depth: 0, network });

// Silenzia un logger: stessa interfaccia (`Tagged`), ogni metodo diventa un IO no-op
const mutedIO: IO.IO<void> = () => undefined;

export const muted = (_logger: Tagged): Tagged => {
  const muted: Tagged = {
    debug: () => mutedIO,
    info: () => mutedIO,
    warn: () => mutedIO,
    error: () => mutedIO,
    logNetwork: () => mutedIO,
    child: () => muted,
  };
  return muted;
};

// -------------------------------------------------------------------------------------
// ANSI rendering (terminal transports only)
// -------------------------------------------------------------------------------------

const INDENT_SIZE = 2;

// Aligns continuation lines of a multiline message under where the first line's text
// starts, so a block of text logged in one call (e.g. formatJsonLog output) reads as a
// single indented block instead of ragged lines starting at column 0.
export const padContinuationLines = (message: string, pad: number): string =>
  message.includes("\n") ? message.split("\n").join(`\n${" ".repeat(pad)}`) : message;

export const renderAnsi = (record: LogRecord): string => {
  const time = new Date(record.timestamp).toLocaleTimeString("it-IT");
  const indent = " ".repeat(record.depth * INDENT_SIZE);
  const tagText = record.tag ? `[${record.tag}] ` : "";
  const tagAnsi = record.tag ? `${TAG_PALETTE[record.color ?? 0]?.ansi ?? ""}${tagText}${ANSI_RESET}` : "";
  const levelAnsi = LEVEL_PALETTE[record.level]?.ansi ?? "";

  const prefix = `${time} | `;
  const message = padContinuationLines(record.message, prefix.length + indent.length + tagText.length);

  return `${prefix}${indent}${tagAnsi}${levelAnsi}${message}${ANSI_RESET}`;
};

// -------------------------------------------------------------------------------------
// Built-in transports
// -------------------------------------------------------------------------------------

export const consoleTransport: Transport = (record) => {
  console.log(renderAnsi(record));
};

export const stdoutTransport: Transport = (record) => {
  (globalThis as any).process?.stdout?.write(`${renderAnsi(record)}\n`);
};

// -------------------------------------------------------------------------------------
// Console logger (convenience, no dependencies)
// -------------------------------------------------------------------------------------

export const createConsoleLogger = (level: LogLevel = "info"): Tagged => create(level, [consoleTransport]);
export const createStdoutLogger = (level: LogLevel = "info"): Tagged => create(level, [stdoutTransport]);

// -------------------------------------------------------------------------------------
// formatting
// -------------------------------------------------------------------------------------

export const formatJsonLog = (entries: readonly Record<string, unknown>[]): string =>
  entries.map((entry) => `(JSON) ${JSON.stringify(entry, null, 2)}`).join("\n");

export const formatMs = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} seconds`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} minuntes`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
};
