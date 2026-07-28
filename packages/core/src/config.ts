import type { ValidationError } from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";
import { ActivationScheduleCodec } from "./activation/schedule";
import { DurationString } from "./date-time";
import { AdbEntryCodec, CameraEntryCodec, CandyboxEntryCodec, TvEntryCodec } from "./db";
import { of } from "./errors";
import { LogLevel } from "./logger/logger";
import * as Network from "./network";
import { RecoveryPolicyCodec } from "./recovery/codec";
import { PolicyJsonCodec } from "./retry/codec";
import { WorkflowJsonCodec } from "./workflow/codec";

// -------------------------------------------------------------------------------------
// Model - Configurazione del servizio
// -------------------------------------------------------------------------------------

// Credenziali Suitest
const SuitestCodec = t.type({
  baseUrl: t.string,
  tokenId: t.string,
  tokenPassword: t.string,
});

export type Suitest = t.TypeOf<typeof SuitestCodec>;

// Credenziali Slack
const SlackCodec = t.type({
  active: t.boolean,
  botToken: t.string,
});

export type Slack = t.TypeOf<typeof SlackCodec>;

// Configurazione dei tracker di predicati (packages/core/src/predicates): una policy di
// polling indipendente per dominio, ognuno interrogato a una cadenza propria
const TrackingCodec = t.type({
  adb: t.type({ polling: PolicyJsonCodec }),
  suitestCamera: t.type({ polling: PolicyJsonCodec }),
  suitestControlUnit: t.type({ polling: PolicyJsonCodec }),
  suitestDevice: t.type({ polling: PolicyJsonCodec }),
});

export type Tracking = t.TypeOf<typeof TrackingCodec>;

// Configurazione logging
// `network`: stampa le risposte HTTP (get/post, singole o paginate) indipendentemente dal
// `level` configurato - non esiste un livello "verbose" supportato dalla console, quindi è
// un interruttore a parte invece di un settimo livello di soglia (vedi Logger.logNetwork)
const LogCodec = t.intersection([t.type({ level: LogLevel }), t.partial({ path: t.string, network: t.boolean })]);

export type Log = t.TypeOf<typeof LogCodec>; // Esportata e rinominato per servizio

// Configurazione connessione ADB
// `waitForDeviceTimeout`: limite intrinseco per il comando waitForDevice di un workflow (vedi
// packages/core/src/workflow/interpreter.ts) - senza questo, un device che non torna mai online
// bloccherebbe la pipeline per sempre (vedi RECOVERY-REBOOT-LOOP.md, punto 4)
const AdbCodec = t.type({
  port: Network.PortCodec,
  reconnect: PolicyJsonCodec,
  waitForDeviceTimeout: DurationString,
});

export type Adb = t.TypeOf<typeof AdbCodec>;

const TrpcCodec = t.type({
  port: t.number,
  hostname: t.string,
});

export type Trpc = t.TypeOf<typeof TrpcCodec>;

const RegistryCodec = t.intersection([
  t.type({ dbPath: t.string }),
  t.partial({
    devices: t.partial({
      candyboxes: t.array(CandyboxEntryCodec),
      cameras: t.array(CameraEntryCodec),
      tvs: t.array(TvEntryCodec),
      adb: t.array(AdbEntryCodec),
    }),
  }),
]);

export type Registry = t.TypeOf<typeof RegistryCodec>;

const ServiceCodec = t.intersection([
  t.type({
    activationSchedule: ActivationScheduleCodec,
    suitest: SuitestCodec,
    slack: SlackCodec,
    tracking: TrackingCodec,
    adb: AdbCodec,
    log: LogCodec,
    workflows: t.array(WorkflowJsonCodec),
    trpc: TrpcCodec,
    registry: RegistryCodec,
  }),
  // `recovery` (Recovery Model) opzionale perché non tutte le installazioni definiscono policy di recovery
  t.partial({
    recovery: t.array(RecoveryPolicyCodec),
  }),
]);

export type Service = t.TypeOf<typeof ServiceCodec>;

// -------------------------------------------------------------------------------------
// Validazione
// -------------------------------------------------------------------------------------

const formatErrors = (errors: t.Errors): string =>
  errors
    .map(
      (e) =>
        `  ${e.context
          .map((c) => c.key)
          .filter(Boolean)
          .join(".")} : ${JSON.stringify(e.value)}`,
    )
    .join("\n");

// Valida e decodifica un oggetto JSON in ServiceConfig
export const decode = (raw: unknown): E.Either<ValidationError, Service> =>
  pipe(
    raw,
    ServiceCodec.decode,
    E.mapLeft((errors) => of("ValidationError")(`Invalid configuration:\n${formatErrors(errors)}`)),
  );

// -------------------------------------------------------------------------------------
// Redazione - da usare ogni volta che la config viene esposta fuori dal processo (es. UI
// di sola lettura via tRPC): maschera le credenziali, non va mai loggata/servita raw.
// -------------------------------------------------------------------------------------

const REDACTED = "[redacted]";

export const redact = (config: Service): Service => ({
  ...config,
  suitest: { ...config.suitest, tokenId: REDACTED, tokenPassword: REDACTED },
  slack: { ...config.slack, botToken: REDACTED },
});
