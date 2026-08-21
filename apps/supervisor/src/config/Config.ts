// Il confine del servizio: un file scritto a mano entra, e ne esce il mondo già in lingua di
// dominio — `SupervisionProfile`, `Device.Draft`, `Duration`. io-ts sta qui e solo qui (A-9).
// Due passi distinti, di proposito: `Shape` dice se il file ha la forma giusta, `build` se dice
// cose sensate. Il secondo passo usa gli **smart constructor del dominio** — `Playbook.make`,
// `SupervisionProfile.make` — quindi un playbook che non finisce verificando la faccia d'innesco
// (INV-6) o che chiede `AdbTcp` a una TV viene rifiutato all'avvio, non alla prima sessione.
// I profili reali del lab vivono qui: è il composition root il loro posto, non il codice.

import type { SlackNotifier } from "@lab/alerting";
import type { AdbDeviceControl, SuitestHealthProbe } from "@lab/hardware-control";
import * as Duration from "@lab/kernel/Duration";
import * as FlappingPolicy from "@lab/monitoring/domain/FlappingPolicy";
import * as CorrelationPolicy from "@lab/recovery/domain/CorrelationPolicy";
import * as CorrelationRule from "@lab/recovery/domain/CorrelationRule";
import * as Playbook from "@lab/recovery/domain/Playbook";
import * as Remedy from "@lab/recovery/domain/Remedy";
import * as RemedyStep from "@lab/recovery/domain/RemedyStep";
import * as RetryPolicy from "@lab/recovery/domain/RetryPolicy";
import * as SupervisionProfile from "@lab/recovery/domain/SupervisionProfile";
import * as SupervisionWindow from "@lab/recovery/domain/SupervisionWindow";
import * as VerificationSpec from "@lab/recovery/domain/VerificationSpec";
import * as Capability from "@lab/registry/domain/Capability";
import type * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as Endpoints from "@lab/registry/domain/Endpoints";
import type { Relation } from "@lab/registry/domain/Relation";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import * as t from "io-ts";
import * as Jsonc from "./Jsonc";
import { DayOfWeekCodec, DurationFromString, TapCodec, TimeOfDayFromString } from "./Scalars";

// ── la forma del file ────────────────────────────────────────────────────────────────────────

const FacetCodec = t.keyof({ Reachable: null, AdbTransport: null, StreamAvailable: null });

const RemedyShape = t.union([
  t.type({ remedy: t.literal("ReconnectTransport") }),
  t.type({ remedy: t.literal("RelaunchSuite") }),
  t.type({ remedy: t.literal("RebootHardware") }),
  t.type({ remedy: t.literal("PowerOn") }),
  t.type({ remedy: t.literal("RestartApp"), app: t.string }),
]);

const BackoffShape = t.union([
  t.type({ kind: t.literal("fixed"), delay: DurationFromString }),
  t.type({
    kind: t.literal("exponential"),
    base: DurationFromString,
    factor: t.number,
    cap: DurationFromString,
  }),
]);

const StepShape = t.intersection([
  RemedyShape,
  t.type({
    dispatchTimeout: DurationFromString,
    verify: t.type({
      facet: FacetCodec,
      settle: DurationFromString,
      poll: DurationFromString,
      timeout: DurationFromString,
    }),
    retry: t.type({ maxAttempts: t.number, backoff: BackoffShape }),
  }),
  t.partial({ appliesWhen: t.type({ facet: FacetCodec, is: t.keyof({ Healthy: null, Unhealthy: null }) }) }),
]);

const CorrelationShape = t.type({
  rule: t.union([
    t.type({ kind: t.literal("allChildren") }),
    t.type({ kind: t.literal("minChildren"), min: t.number }),
    t.type({ kind: t.literal("fraction"), value: t.number }),
  ]),
  grace: DurationFromString,
});

const WindowShape = t.type({
  days: t.array(DayOfWeekCodec),
  from: TimeOfDayFromString,
  to: TimeOfDayFromString,
  zone: t.string,
});

const KindCodec = t.keyof({ ControlUnit: null, Tv: null, AndroidCamera: null });

const ProfileShape = t.intersection([
  t.type({
    kind: KindCodec,
    trigger: FacetCodec,
    grace: DurationFromString,
    criticality: t.keyof({ NotifyWhenExhausted: null, NotifyImmediately: null }),
    cooldownAfterGiveUp: DurationFromString,
    window: WindowShape,
    playbook: t.array(StepShape),
  }),
  t.partial({ correlation: CorrelationShape }),
]);

const DeviceShape = t.intersection([
  t.type({ id: t.string, kind: KindCodec }),
  t.partial({
    unitType: t.keyof({ candybox: null, drive: null, "personal-pi": null, "solo-candy": null }),
    adb: t.string,
    suitest: t.string,
    capabilities: t.array(t.keyof({ PowerOn: null, RebootHardware: null, AppControl: null, AdbTcp: null })),
    monitored: t.boolean,
    attach: t.type({ to: t.string, relation: t.keyof({ DependsOn: null, Observes: null }) }),
  }),
]);

const Shape = t.type({
  log: t.type({ level: t.keyof({ error: null, warn: null, info: null, debug: null }) }),
  monitoring: t.type({
    probeInterval: DurationFromString,
    snapshotTtl: DurationFromString,
    flapping: t.type({ failureThreshold: t.number, successThreshold: t.number }),
  }),
  recovery: t.type({ tickInterval: DurationFromString }),
  suitest: t.type({ baseUrl: t.string, tokenId: t.string, tokenPassword: t.string, timeout: DurationFromString }),
  adb: t.type({
    binary: t.string,
    commandTimeout: DurationFromString,
    bootTimeout: DurationFromString,
    captureApp: t.type({
      packageId: t.string,
      activity: t.string,
      settleAfterLaunch: DurationFromString,
      profileTaps: t.array(TapCodec),
      connectTaps: t.array(TapCodec),
    }),
  }),
  slack: t.type({
    active: t.boolean,
    baseUrl: t.string,
    botToken: t.string,
    channel: t.string,
    timeout: DurationFromString,
  }),
  devices: t.array(DeviceShape),
  profiles: t.array(ProfileShape),
});

// ── il mondo che ne esce ─────────────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warn" | "info" | "debug";

// Un device dell'anagrafica come lo scrive chi configura: la bozza, e dove va appeso. L'arco è
// separato perché lo è anche nel dominio — attaccare è l'unica operazione che guarda il resto
// della topologia (INV-12).
export type DeviceEntry = {
  readonly draft: Device.Draft;
  readonly attach: O.Option<{ readonly to: DeviceId.DeviceId; readonly relation: Relation }>;
};

export type Config = {
  readonly log: { readonly level: LogLevel };
  readonly monitoring: {
    readonly probeInterval: Duration.Duration;
    readonly snapshotTtl: Duration.Duration;
    readonly flapping: FlappingPolicy.FlappingPolicy;
  };
  readonly recovery: { readonly tickInterval: Duration.Duration };
  readonly suitest: SuitestHealthProbe.SuitestConfig;
  readonly adb: AdbDeviceControl.AdbConfig;
  readonly slack: { readonly active: boolean } & SlackNotifier.SlackConfig;
  readonly devices: ReadonlyArray<DeviceEntry>;
  readonly profiles: ReadonlyArray<SupervisionProfile.SupervisionProfile>;
};

export type ConfigError =
  | Jsonc.ParseFailure
  | { readonly _tag: "InvalidShape"; readonly paths: ReadonlyArray<string> }
  | { readonly _tag: "InvalidValue"; readonly detail: string };

const invalidValue = (detail: string): ConfigError => ({ _tag: "InvalidValue", detail });

export const describe = (error: ConfigError): string => {
  switch (error._tag) {
    case "ParseFailure":
      return `configurazione illeggibile: ${error.detail}`;
    case "InvalidShape":
      return `configurazione non conforme: ${error.paths.join(", ")}`;
    case "InvalidValue":
      return `configurazione non valida: ${error.detail}`;
  }
};

// ── da forma a dominio ───────────────────────────────────────────────────────────────────────

const toRemedy = (step: t.TypeOf<typeof StepShape>): Remedy.Remedy => {
  switch (step.remedy) {
    case "ReconnectTransport":
      return Remedy.reconnectTransport;
    case "RelaunchSuite":
      return Remedy.relaunchSuite;
    case "RebootHardware":
      return Remedy.rebootHardware;
    case "PowerOn":
      return Remedy.powerOn;
    case "RestartApp":
      return Remedy.restartApp(Remedy.appRef(step.app));
  }
};

const toBackoff = (backoff: t.TypeOf<typeof BackoffShape>): RetryPolicy.Backoff =>
  backoff.kind === "fixed"
    ? RetryPolicy.fixed(backoff.delay)
    : RetryPolicy.exponential(backoff.base, backoff.factor, backoff.cap);

const toStep = (step: t.TypeOf<typeof StepShape>): RemedyStep.RemedyStep =>
  RemedyStep.make({
    remedy: toRemedy(step),
    appliesWhen: pipe(
      O.fromNullable(step.appliesWhen),
      O.map((condition) => RemedyStep.when(condition.facet, condition.is)),
    ),
    dispatchTimeout: step.dispatchTimeout,
    verification: VerificationSpec.make(step.verify.facet, step.verify.settle, step.verify.poll, step.verify.timeout),
    retry: RetryPolicy.make(step.retry.maxAttempts, toBackoff(step.retry.backoff)),
  });

const toCorrelation = (correlation: t.TypeOf<typeof CorrelationShape>): CorrelationPolicy.CorrelationPolicy => {
  const rule =
    correlation.rule.kind === "allChildren"
      ? CorrelationRule.allChildren
      : correlation.rule.kind === "minChildren"
        ? CorrelationRule.minChildren(correlation.rule.min)
        : CorrelationRule.fraction(correlation.rule.value);
  return CorrelationPolicy.make(rule, correlation.grace);
};

const toProfile = (
  profile: t.TypeOf<typeof ProfileShape>,
): E.Either<ConfigError, SupervisionProfile.SupervisionProfile> =>
  pipe(
    Playbook.make(profile.playbook.map(toStep), profile.trigger),
    E.mapLeft((error) => invalidValue(`playbook di ${profile.kind}: ${error._tag}`)),
    E.flatMap((playbook) =>
      pipe(
        SupervisionProfile.make(
          {
            kind: profile.kind,
            trigger: profile.trigger,
            gracePeriod: profile.grace,
            playbook,
            criticality: profile.criticality,
            cooldownAfterGiveUp: profile.cooldownAfterGiveUp,
            window: SupervisionWindow.make(
              profile.window.days,
              profile.window.from,
              profile.window.to,
              profile.window.zone,
            ),
            correlation: pipe(O.fromNullable(profile.correlation), O.map(toCorrelation)),
          },
          Capability.capabilitiesOfKind(profile.kind),
        ),
        E.mapLeft((error) => invalidValue(`profilo di ${profile.kind}: ${error._tag}`)),
      ),
    ),
  );

const toDevice = (device: t.TypeOf<typeof DeviceShape>): DeviceEntry => ({
  draft: {
    id: DeviceId.of(device.id),
    kind: device.kind,
    unitType: O.fromNullable(device.unitType),
    endpoints: Endpoints.make({
      adb: pipe(O.fromNullable(device.adb), O.map(Endpoints.adbEndpoint)),
      suitest: pipe(O.fromNullable(device.suitest), O.map(Endpoints.suitestRef)),
    }),
    capabilities: pipe(
      O.fromNullable(device.capabilities),
      O.map((capabilities) => new Set(capabilities)),
      O.getOrElse(() => Capability.capabilitiesOfKind(device.kind)),
    ),
    monitored: device.monitored ?? true,
  },
  attach: pipe(
    O.fromNullable(device.attach),
    O.map((attach) => ({ to: DeviceId.of(attach.to), relation: attach.relation })),
  ),
});

// Il mirror Suitest non deve poter sopravvivere a un giro di sonde: se due tick di fila leggessero
// la stessa fotografia, l'anti-flapping conterebbe due volte la stessa osservazione e un guasto
// risulterebbe confermato prima del dovuto.
const staleSnapshot = (config: Config): O.Option<ConfigError> =>
  Duration.Ord.compare(config.monitoring.snapshotTtl, config.monitoring.probeInterval) >= 0
    ? O.some(
        invalidValue(
          `monitoring.snapshotTtl (${Duration.toMillis(config.monitoring.snapshotTtl)}ms) deve essere minore di monitoring.probeInterval (${Duration.toMillis(config.monitoring.probeInterval)}ms)`,
        ),
      )
    : O.none;

const build = (shape: t.TypeOf<typeof Shape>): E.Either<ConfigError, Config> =>
  pipe(
    shape.profiles,
    E.traverseArray(toProfile),
    E.map(
      (profiles): Config => ({
        log: shape.log,
        monitoring: {
          probeInterval: shape.monitoring.probeInterval,
          snapshotTtl: shape.monitoring.snapshotTtl,
          flapping: FlappingPolicy.make(
            shape.monitoring.flapping.failureThreshold,
            shape.monitoring.flapping.successThreshold,
          ),
        },
        recovery: shape.recovery,
        suitest: {
          baseUrl: shape.suitest.baseUrl,
          tokenId: shape.suitest.tokenId,
          tokenPassword: shape.suitest.tokenPassword,
          timeoutMs: Duration.toMillis(shape.suitest.timeout),
        },
        adb: {
          binary: shape.adb.binary,
          commandTimeoutMs: Duration.toMillis(shape.adb.commandTimeout),
          bootTimeoutMs: Duration.toMillis(shape.adb.bootTimeout),
          captureApp: {
            packageId: shape.adb.captureApp.packageId,
            activity: shape.adb.captureApp.activity,
            profileTaps: shape.adb.captureApp.profileTaps,
            connectTaps: shape.adb.captureApp.connectTaps,
            settleAfterLaunchMs: Duration.toMillis(shape.adb.captureApp.settleAfterLaunch),
          },
        },
        slack: {
          active: shape.slack.active,
          baseUrl: shape.slack.baseUrl,
          botToken: shape.slack.botToken,
          channel: shape.slack.channel,
          timeoutMs: Duration.toMillis(shape.slack.timeout),
        },
        devices: shape.devices.map(toDevice),
        profiles,
      }),
    ),
    E.flatMap((config) =>
      pipe(
        staleSnapshot(config),
        O.match(
          () => E.right(config),
          (error) => E.left(error),
        ),
      ),
    ),
  );

// I percorsi che non hanno decodificato, non un "Invalid value" nudo: chi ha scritto il file deve
// sapere quale riga riscrivere.
const paths = (errors: t.Errors): ReadonlyArray<string> =>
  pipe(
    errors,
    RA.map((error) => {
      const path = error.context
        .map(({ key }) => key)
        .filter((key) => key !== "")
        .join(".");
      return error.message === undefined ? path : `${path}: ${error.message}`;
    }),
    RA.uniq(S.Eq),
  );

export const decode = (raw: unknown): E.Either<ConfigError, Config> =>
  pipe(
    Shape.decode(raw),
    E.mapLeft((errors): ConfigError => ({ _tag: "InvalidShape", paths: paths(errors) })),
    E.flatMap(build),
  );

export const parse = (text: string): E.Either<ConfigError, Config> => pipe(Jsonc.parse(text), E.flatMap(decode));
