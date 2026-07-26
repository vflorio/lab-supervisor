import type * as ConfigModel from "@supervisor/core/config";
import type * as Logger from "@supervisor/core/logger";
import * as NotifyDispatch from "@supervisor/core/notify/dispatch";
import type { NotifyLifecycle, NotifyRule } from "@supervisor/core/notify/model";
import type * as NotifyStream from "@supervisor/core/notify/stream";
import type * as Predicates from "@supervisor/core/predicates/index";
import * as Recovery from "@supervisor/core/recovery/index";
import type { PolicyDecodeError } from "@supervisor/core/retry/codec";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import type { SlackConfig } from "@supervisor/core/services/slack";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import * as Node from "../node";
import * as Registry from "../registry";
import type * as Workflow from "../workflow";
import * as Capabilities from "./capabilities";
import * as Target from "./target";

// -------------------------------------------------------------------------------------
// Composizione a livello di ActiveLifecycle:
// una Recovery.start per ogni RecoveryPolicy configurata (config.recovery, opzionale)
// - ognuna osserva solo il proprio dominio (Recovery.start filtra già sul policy.domain)
//  sullo stesso PredicateFeed, ed emette sullo stesso RecoveryStream.
//
// Ogni transizione di stato alimenta anche il notify dispatcher :
// "immediate" quando il tripwire scatta (entra in "fired"), "exhausted" quando i retry sono
// esauriti senza successo - nessun altro stato genera notifiche.
// -------------------------------------------------------------------------------------

const TICK_POLICY: RetryPolicy.Policy = RetryPolicy.constantDelay(1000);

export interface Env {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly predicateStream: Predicates.PredicateFeed;
  readonly recoveryStream: Recovery.RecoveryStream;
  readonly notifyStream: NotifyStream.NotifyStream;
}

export type StartError = PolicyDecodeError;

export interface Handle {
  readonly stop: () => void;
}

// Deriva il NotifyLifecycle (se presente) da uno StatusEvent del motore di recovery
// - "immediate" alla transizione in "fired"
// - "exhausted" quando l'outcome della pipeline è terminata
// nessun altro evento (in particolare un outcome "succeeded") notifica.
const lifecycleOf = (event: Recovery.StatusEvent): O.Option<NotifyLifecycle> =>
  match(event)
    .with({ type: "transition", state: "fired" }, (): O.Option<NotifyLifecycle> => O.some("immediate"))
    .with({ type: "outcome", outcome: "exhausted" }, (): O.Option<NotifyLifecycle> => O.some("exhausted"))
    .otherwise((): O.Option<NotifyLifecycle> => O.none);

// Traduce uno StatusEvent nella entry piatta attesa da RecoveryStream:
// (l'invariante "un outcome è sempre in stato fired" è reso esplicito qui)
const statusFieldsOf = (
  event: Recovery.StatusEvent,
): { readonly state: Recovery.RecoveryStatusEntry["state"]; readonly outcome?: "succeeded" | "exhausted" } =>
  match(event)
    .with({ type: "transition" }, ({ state }) => ({ state }))
    .with({ type: "outcome" }, ({ outcome }) => ({ state: "fired" as const, outcome }))
    .exhaustive();

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
  };

  // Descrive l'entità coinvolta (label/ip leggibili, oltre al solo entityId) per i
  // placeholder del messaggio (vedi NotifyRule.message / notify/template.ts) - un fallimento
  // di lettura registry ricade sul solo entityId invece di far fallire la notifica.
  const describeSource = (source: NotifyStream.NotifyEventSource): T.Task<Target.EntityDescriptor> =>
    pipe(
      Registry.read(capabilitiesEnv.registryEnv),
      TE.map((db) => Target.describeEntity(source.domain, source.entityId, db.lab)),
      TE.getOrElse(() => T.of<Target.EntityDescriptor>({ id: source.entityId, label: source.entityId, ip: "unknown" })),
    );

  // Dispatcha un lifecycle e pubblica ogni esito sul NotifyStream.
  // Un Task singolo e limitato (una POST Slack per rule)
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
      Recovery.start(policy, {
        logger: env.logger.child(`RecoveryPolicy:${policy.label}`),
        stream: env.predicateStream,
        workflows: env.config.workflows,
        capabilitiesFor: Capabilities.capabilitiesFor(policy.domain, capabilitiesEnv),
        tickPolicy: TICK_POLICY,
        onStatus: (entityId, tripwireIndex, event) => {
          const source: NotifyStream.NotifyEventSource = {
            policy: policy.label,
            domain: policy.domain,
            entityId,
            tripwireIndex,
          };

          env.recoveryStream.emit({ ...source, ...statusFieldsOf(event) });

          pipe(
            lifecycleOf(event),
            O.match(
              () => {},
              (lifecycle) => {
                const rules = policy.tripwires[tripwireIndex]?.notify ?? [];
                // TODO: Modello Async sopra T & TE per gestire in modo dichiarativo il deataching
                void notify(source, lifecycle, rules)();
              },
            ),
          );
        },
      }),
    ),
    E.map(
      (handles): Handle => ({
        stop: () => {
          for (const handle of handles) handle.stop();
        },
      }),
    ),
  );
};
