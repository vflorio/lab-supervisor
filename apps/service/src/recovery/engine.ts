import type * as Activity from "@supervisor/core/activity/stream";
import type { SlackConfig } from "@supervisor/core/adapters/slack";
import type * as ConfigModel from "@supervisor/core/config";
import { durationToMs } from "@supervisor/core/date-time";
import type * as Logger from "@supervisor/core/logger/logger";
import * as NotifyDispatch from "@supervisor/core/notify/dispatch";
import type { NotifyLifecycle, NotifyRule } from "@supervisor/core/notify/model";
import type * as NotifyStream from "@supervisor/core/notify/stream";
import type * as Predicates from "@supervisor/core/predicates/index";
import * as Recovery from "@supervisor/core/recovery/index";
import type { PolicyDecodeError } from "@supervisor/core/retry/codec";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type * as AndroidBridgeOrchestrator from "../android-bridge";
import * as Node from "../node";
import * as Registry from "../registry";
import type * as Workflow from "../workflow";
import * as Capabilities from "./capabilities";
import * as Target from "./target";

// Una Recovery.start per ogni RecoveryPolicy configurata (opzionale), ognuna filtrata sul
// proprio dominio, sullo stesso PredicateFeed, che emette sullo stesso RecoveryStream.
// Ogni transizione di stato alimenta anche il notify dispatcher: "immediate" quando il
// tripwire scatta, "exhausted" quando i retry sono esauriti o la pipeline fallisce
// (fatalError riusa lo stesso lifecycle) - nessun altro stato notifica.

// Cadenza del tick di ri-osservazione di ogni RecoveryRunner - non configurabile: serve solo
// a rilevare un grace period scaduto anche senza nuovi fatti dal predicate feed (nessun I/O
// proprio). Un tick più fitto costa solo CPU locale, non richieste esterne.
const TICK_POLICY: RetryPolicy.Policy = RetryPolicy.constantDelay(1000);

export interface Env {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly predicateStream: Predicates.PredicateFeed;
  readonly recoveryStream: Recovery.RecoveryStream;
  readonly notifyStream: NotifyStream.NotifyStream;
  readonly activityStream: Activity.ActivityStream;
  readonly androidBridge: AndroidBridgeOrchestrator.Handle;
}

export type StartError = PolicyDecodeError;

export interface Handle {
  readonly stop: () => void;
  // Riarma il tripwire di un'entità dopo un esaurimento dei retry (intervento manuale).
  // `false` se la policy non esiste o l'entità non è mai stata osservata da quella policy.
  readonly reset: (policyLabel: string, entityId: string, tripwireIndex: number) => boolean;
}

// Deriva il NotifyLifecycle dal tag di TripwireState raggiunto; un ritorno a "healthy" non notifica.
const lifecycleOf = (tag: Recovery.TripwireState["tag"]): O.Option<NotifyLifecycle> =>
  match(tag)
    .with("recovering", (): O.Option<NotifyLifecycle> => O.some("immediate"))
    .with("exhausted", (): O.Option<NotifyLifecycle> => O.some("exhausted"))
    .with("fatalError", (): O.Option<NotifyLifecycle> => O.some("exhausted"))
    .otherwise((): O.Option<NotifyLifecycle> => O.none);

export const start = (env: Env): E.Either<StartError, Handle> => {
  const notifyLog = env.logger.child("Notify");
  const slackConfig: O.Option<SlackConfig> = env.config.slack.active
    ? O.some({ botToken: env.config.slack.botToken })
    : O.none;

  const workflowEnv: Workflow.WorkflowRunnerEnv = {
    logger: env.logger.child("Workflow"),
    workflows: env.config.workflows,
    spawn: Node.spawn,
  };

  const capabilitiesEnv: Capabilities.Env = {
    logger: env.logger,
    workflowEnv,
    registryEnv: {
      logger: env.logger.child("Registry"),
      suitestConfig: env.config.suitest,
      dbPath: env.config.registry.dbPath,
      seedDevices: env.config.registry.devices,
      fsEnv: Node.fsEnv,
    },
    androidBridge: env.androidBridge,
    waitForDeviceTimeoutMs: durationToMs(env.config.adb.waitForDeviceTimeout),
  };

  // Descrive l'entità (label/ip leggibili) per i placeholder del messaggio di notifica; un
  // fallimento di lettura registry ricade sul solo entityId invece di far fallire la notifica.
  const describeSource = (source: NotifyStream.NotifyEventSource): T.Task<Target.EntityDescriptor> =>
    pipe(
      Registry.read(capabilitiesEnv.registryEnv),
      TE.map((db) => Target.describeEntity(source.domain, source.entityId, db.lab)),
      TE.getOrElse(() => T.of<Target.EntityDescriptor>({ id: source.entityId, label: source.entityId, ip: "unknown" })),
    );

  // Dispatcha un lifecycle e pubblica ogni esito sul NotifyStream (un Task per rule).
  const notify = (
    source: NotifyStream.NotifyEventSource,
    lifecycle: NotifyLifecycle,
    rules: readonly NotifyRule[],
  ): T.Task<void> =>
    pipe(
      describeSource(source),
      T.flatMap((entity) => {
        const vars: Record<string, string> = {
          id: entity.id,
          label: entity.label,
          ip: entity.ip,
          domain: source.domain,
          policy: source.policy,
          tripwireIndex: String(source.tripwireIndex),
        };

        return pipe(
          NotifyDispatch.dispatch(rules, lifecycle, vars, { logger: notifyLog, slack: slackConfig }),
          T.map((results) => {
            for (const result of results) {
              env.notifyStream.emit({
                source,
                lifecycle,
                channel: result.rule.channel,
                message: result.message,
                dispatch: { slack: result.slack },
              });
            }
          }),
        );
      }),
    );

  return pipe(
    env.config.recovery ?? [],
    E.traverseArray((policy) =>
      pipe(
        Recovery.start(policy, {
          logger: env.logger.child(`RecoveryPolicy:${policy.label}`),
          stream: env.predicateStream,
          workflows: env.config.workflows,
          capabilitiesFor: Capabilities.capabilitiesFor(policy.domain, capabilitiesEnv),
          tickPolicy: TICK_POLICY,
          onStatus: (entityId, tripwireIndex, state) => {
            const source: NotifyStream.NotifyEventSource = {
              policy: policy.label,
              domain: policy.domain,
              entityId,
              tripwireIndex,
            };

            env.recoveryStream.emit({
              ...source,
              state: state.tag,
              ...(state.tag === "fatalError" ? { error: state.error } : {}),
            });

            env.activityStream.emit({ entityId, source: "recovery", status: state.tag });

            pipe(
              lifecycleOf(state.tag),
              O.match(
                () => {},
                (lifecycle) => {
                  const rules = policy.tripwires[tripwireIndex]?.notify ?? [];
                  // onStatus è un callback sincrono, non può essere await-ato: detach and
                  // forget, il dispatch resta comunque breve (una richiesta HTTP per rule).
                  void notify(source, lifecycle, rules)();
                },
              ),
            );
          },
        }),
        E.map((handle): readonly [string, Recovery.RecoveryRunnerHandle] => [policy.label, handle]),
      ),
    ),
    E.map((entries): Handle => {
      const handles = new Map(entries);
      return {
        stop: () => {
          for (const handle of handles.values()) handle.stop();
        },
        reset: (policyLabel, entityId, tripwireIndex) =>
          handles.get(policyLabel)?.reset(entityId, tripwireIndex) ?? false,
      };
    }),
  );
};
