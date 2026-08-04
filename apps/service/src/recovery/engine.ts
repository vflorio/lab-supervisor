import type * as Activity from "@supervisor/core/activity/stream";
import type { SlackConfig } from "@supervisor/core/adapters/slack";
import type * as ConfigModel from "@supervisor/core/config";
import * as DateTime from "@supervisor/core/date-time";
import type * as Fact from "@supervisor/core/fact/index";
import type * as Logger from "@supervisor/core/logger/logger";
import * as NotifyDispatch from "@supervisor/core/notify/dispatch";
import type { NotifyLifecycle, NotifyRule } from "@supervisor/core/notify/model";
import type * as NotifyStream from "@supervisor/core/notify/stream";
import * as Recovery from "@supervisor/core/recovery/index";
import * as RetryCodec from "@supervisor/core/retry/codec";
import type * as TaskRunner from "@supervisor/core/task-runner/index";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type * as AndroidBridge from "../android-bridge/runner";
import * as Node from "../node";
import * as Registry from "../registry";
import type * as AdbCapabilities from "./adb-capabilities";
import * as Capabilities from "./capabilities";
import * as Target from "./target";

// One Recovery.start per RecoveryPolicy (optional), filtered by domain; transitions notify dispatcher on "recovering" and "exhausted"

const TICK_POLICY = RetryCodec.describedConstant(DateTime.durationToMs("1s"));

export interface Env {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly factStream: Fact.FactFeed;
  readonly recoveryStream: Recovery.RecoveryStream;
  readonly notifyStream: NotifyStream.NotifyStream;
  readonly activityStream: Activity.ActivityStream;
  readonly androidBridge: AndroidBridge.Handle;
  readonly loopStream: TaskRunner.LoopStream;
}

export type StartError = RetryCodec.PolicyDecodeError;

export interface Handle {
  readonly stop: () => void;
  // Rearm tripwire after exhaustion (returns false if policy missing or entity never observed)
  readonly rearmTripwire: (policyLabel: string, entityId: string, tripwireIndex: number) => boolean;
  // Exposed to manual workflow runner; used by RecoveryPolicy so manual runs get same gating and target resolution
  readonly capabilitiesEnv: Capabilities.Env;
}

// Derive NotifyLifecycle from TripwireState tag (healthy returns none)
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

  const workflowEnv: AdbCapabilities.Env = {
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
    waitForDeviceTimeoutMs: DateTime.durationToMs(env.config.adb.waitForDeviceTimeout),
  };

  // Describe entity (readable label/ip) for notification message placeholders; registry read failures fall back to entityId
  const describeSource = (source: NotifyStream.NotifyEventSource): T.Task<Target.EntityDescriptor> =>
    pipe(
      Registry.read(capabilitiesEnv.registryEnv),
      TE.map((db) => Target.describeEntity(source.domain, source.entityId, db.lab)),
      TE.getOrElse(() => T.of<Target.EntityDescriptor>({ id: source.entityId, label: source.entityId, ip: "unknown" })),
    );

  // Dispatch lifecycle and publish each result to NotifyStream (one Task per rule)
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
          stream: env.factStream,
          workflows: env.config.workflows,
          commandsFor: Capabilities.commandsFor(policy.domain, capabilitiesEnv),
          probesFor: Capabilities.probesFor(policy.domain, capabilitiesEnv),
          tickPolicy: TICK_POLICY.policy,
          descriptor: {
            id: `recovery:${policy.label}`,
            label: `Recovery - ${policy.label}`,
            policyLabel: TICK_POLICY.label,
          },
          loopStream: env.loopStream,
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
                  // onStatus is synchronous, can't be awaited; detach & forget (dispatch is still quick)
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
        capabilitiesEnv,
        stop: () => {
          for (const handle of handles.values()) handle.stop();
        },
        rearmTripwire: (policyLabel, entityId, tripwireIndex) =>
          handles.get(policyLabel)?.rearm(entityId, tripwireIndex) ?? false,
      };
    }),
  );
};
