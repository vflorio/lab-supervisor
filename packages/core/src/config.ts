import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";
import * as Activation from "./activation/schedule";
import * as DateTime from "./date-time";
import * as Db from "./db";
import * as Errors from "./errors";
import * as Logger from "./logger/logger";
import * as Network from "./network";
import * as Recovery from "./recovery/codec";
import * as Retry from "./retry/codec";
import * as Workflow from "./workflow/codec";

const SuitestCodec = t.type({
  baseUrl: t.string,
  tokenId: t.string,
  tokenPassword: t.string,
});

export type Suitest = t.TypeOf<typeof SuitestCodec>;

const SlackCodec = t.type({
  active: t.boolean,
  botToken: t.string,
});

export type Slack = t.TypeOf<typeof SlackCodec>;

// Configurazione dei tracker di predicati: una Policy indipendente per dominio,
// ognuno interrogato a una cadenza propria.
const TrackingCodec = t.type({
  adb: t.type({ policy: Retry.PolicyJsonCodec }),
  suitestCamera: t.type({ policy: Retry.PolicyJsonCodec }),
  suitestControlUnit: t.type({ policy: Retry.PolicyJsonCodec }),
  suitestDevice: t.type({ policy: Retry.PolicyJsonCodec }),
});

export type Tracking = t.TypeOf<typeof TrackingCodec>;

// `network`: stampa le risposte HTTP indipendentemente dal `level` configurato - non esiste
// un livello "verbose", quindi è un interruttore a parte invece di una settima soglia.
const LogCodec = t.intersection([
  t.type({ level: Logger.LogLevel }),
  t.partial({ path: t.string, network: t.boolean }),
]);

export type Log = t.TypeOf<typeof LogCodec>;

// `waitForDeviceTimeout`: la pazienza di un workflow che attende che una camera persa torni a
// rispondere - la riconnessione è già in corso in background a prescindere da questo timeout.
// Senza questo, un device che non torna mai online bloccherebbe la pipeline per sempre.
const AdbCodec = t.type({
  port: Network.PortCodec,
  waitForDeviceTimeout: DateTime.DurationString,
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
      candyboxes: t.array(Db.CandyboxEntryCodec),
      cameras: t.array(Db.CameraEntryCodec),
      tvs: t.array(Db.TvEntryCodec),
      adb: t.array(Db.AdbEntryCodec),
    }),
  }),
]);

export type Registry = t.TypeOf<typeof RegistryCodec>;

const ServiceCodec = t.intersection([
  t.type({
    activationSchedule: Activation.ActivationScheduleCodec,
    suitest: SuitestCodec,
    slack: SlackCodec,
    tracking: TrackingCodec,
    adb: AdbCodec,
    log: LogCodec,
    workflows: t.array(Workflow.WorkflowJsonCodec),
    trpc: TrpcCodec,
    registry: RegistryCodec,
  }),
  // `recovery` (Recovery Model) opzionale perché non tutte le installazioni definiscono policy di recovery
  t.partial({
    recovery: t.array(Recovery.RecoveryPolicyCodec),
  }),
]);

export type Service = t.TypeOf<typeof ServiceCodec>;

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

export const decode = (raw: unknown): E.Either<Validation.ValidationError, Service> =>
  pipe(
    raw,
    ServiceCodec.decode,
    E.mapLeft((errors) => Errors.of("ValidationError")(`Invalid configuration:\n${formatErrors(errors)}`)),
  );

// Da usare ogni volta che la config viene esposta fuori dal processo: maschera le credenziali,
// non va mai loggata/servita raw.

const REDACTED = "[redacted]";

export const redact = (config: Service): Service => ({
  ...config,
  suitest: { ...config.suitest, tokenId: REDACTED, tokenPassword: REDACTED },
  slack: { ...config.slack, botToken: REDACTED },
});
