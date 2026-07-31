import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import type { Endomorphism } from "fp-ts/Endomorphism";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import { applyEdits, type FormattingOptions, modify as jsoncModify, parse as parseJsoncText } from "jsonc-parser";
import * as Activation from "./activation/schedule";
import * as DateTime from "./date-time";
import * as Db from "./db";
import * as Errors from "./errors";
import type * as Fs from "./fs";
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

// Sottoinsieme editabile di suitest/slack (mai le credenziali, vedi `redact`) + trpc/log/adb/tracking
// per intero - usato dalla card "infra" delle Settings, in-memory come activationSchedule/workflows/recovery.
export const InfraCodec = t.type({
  suitest: t.type({ baseUrl: t.string }),
  slack: t.type({ active: t.boolean }),
  trpc: TrpcCodec,
  log: LogCodec,
  adb: AdbCodec,
  tracking: TrackingCodec,
});

export type Infra = t.TypeOf<typeof InfraCodec>;

// Patch parziale di `Infra` - stessi campi, tutti opzionali. Wire input di `setConfig`: solo i
// domini presenti vengono sostituiti (per intero, non merge profondo), gli altri campi della
// Service restano invariati. Cresce insieme a `InfraCodec` senza duplicare i field, un dominio
// alla volta (oggi solo infra, in futuro activationSchedule/workflows/recovery/registry).
export const ConfigPatchCodec = t.partial(InfraCodec.props);

export type ConfigPatch = t.TypeOf<typeof ConfigPatchCodec>;

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

const ServiceCodec = t.type({
  activationSchedule: Activation.ActivationScheduleCodec,
  suitest: SuitestCodec,
  slack: SlackCodec,
  tracking: TrackingCodec,
  adb: AdbCodec,
  log: LogCodec,
  workflows: t.array(Workflow.WorkflowJsonCodec),
  trpc: TrpcCodec,
  registry: RegistryCodec,
  recovery: t.array(Recovery.RecoveryPolicyCodec),
});

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

// Applica un ConfigPatch: solo i campi presenti sostituiscono il dominio corrispondente,
// suitest/slack mergiati campo a campo per non perdere le credenziali (mai nel patch, vedi
// `ConfigPatchCodec`/`InfraCodec`).
export const applyPatch =
  (patch: ConfigPatch): Endomorphism<Service> =>
  (current) => ({
    ...current,
    ...(patch.suitest ? { suitest: { ...current.suitest, ...patch.suitest } } : {}),
    ...(patch.slack ? { slack: { ...current.slack, ...patch.slack } } : {}),
    ...(patch.trpc ? { trpc: patch.trpc } : {}),
    ...(patch.log ? { log: patch.log } : {}),
    ...(patch.adb ? { adb: patch.adb } : {}),
    ...(patch.tracking ? { tracking: patch.tracking } : {}),
  });

// -------------------------------------------------------------------------------------
// Persistenza su file (JSONC) - `modify` legge, applica un Endomorphism puro e riscrive solo
// i campi foglia effettivamente cambiati (via jsonc-parser `modify`/`applyEdits`, uno per
// leaf - vedi `diffLeaves`), così i commenti nel resto del file (es. config.home.jsonc, anche
// quelli inline sullo stesso campo modificato) sopravvivono. Stesso pattern read-apply-write
// di `Db.modify`, ma qui serve preservare la formattazione JSONC invece di un JSON piatto.
// -------------------------------------------------------------------------------------

export interface ParseError extends Errors.AppError<"ParseError"> {}

export type ConfigError = Fs.FileSystemError | Validation.ValidationError | ParseError;

const parseJsonc = (raw: string): E.Either<ParseError, unknown> =>
  E.tryCatch(() => parseJsoncText(raw), Errors.fromUnknown("ParseError"));

const FORMATTING_OPTIONS: FormattingOptions = { tabSize: 2, insertSpaces: true, eol: "\n" };

export const readRaw =
  (path: string): ((env: Fs.Env) => TE.TaskEither<ConfigError, { raw: string; config: Service }>) =>
  (env) =>
    pipe(
      env.readFile(path) as TE.TaskEither<ConfigError, string>,
      TE.flatMap((raw) =>
        pipe(
          parseJsonc(raw),
          E.flatMap(decode),
          E.map((config) => ({ raw, config })),
          TE.fromEither,
        ),
      ),
    );

const isPlainObject = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);

interface LeafEdit {
  readonly path: readonly (string | number)[];
  readonly value: unknown;
}

// Diff ricorsivo fino ai campi scalari/array (mai dentro un array - i suoi elementi non hanno
// commenti individuali nel file, vengono sostituiti in blocco). Un edit per foglia cambiata
// invece che per intero top-level key: riscrivere `log` per intero cancellerebbe i commenti
// inline di `level`/`path`/`network`, mentre riscrivere solo `log.level` li lascia intatti.
const diffLeaves = (current: unknown, next: unknown, path: readonly (string | number)[]): readonly LeafEdit[] =>
  isPlainObject(current) && isPlainObject(next)
    ? Object.keys(next).flatMap((key) => diffLeaves(current[key], next[key], [...path, key]))
    : JSON.stringify(current) === JSON.stringify(next)
      ? []
      : [{ path, value: next }];

export const modify =
  (path: string) =>
  (f: Endomorphism<Service>): ((env: Fs.Env) => TE.TaskEither<ConfigError, Service>) =>
  (env) =>
    pipe(
      readRaw(path)(env),
      TE.flatMap(({ raw, config: current }) => {
        const next = f(current);
        const currentEncoded = ServiceCodec.encode(current);
        const nextEncoded = ServiceCodec.encode(next);

        const edits = diffLeaves(currentEncoded, nextEncoded, []);

        const nextText = edits.reduce(
          (text, edit) =>
            applyEdits(text, jsoncModify(text, [...edit.path], edit.value, { formattingOptions: FORMATTING_OPTIONS })),
          raw,
        );

        return pipe(
          env.writeFile(path, nextText),
          TE.map(() => next),
        );
      }),
    );
