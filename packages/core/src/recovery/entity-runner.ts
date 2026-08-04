import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { type AppError, format } from "../errors";
import type * as Logger from "../logger/logger";
import type { PredicateLookup } from "../predicates/expression";
import * as Retry from "../retry/retry";
import * as Machine from "../state-machine/machine";
import type { CommandCapabilities, WorkflowEnv } from "../workflow/interpreter";
import { interpretPipeline } from "../workflow/pipeline-interpreter";
import type { ProbeCapabilities } from "../workflow/probe";
import type { Workflow } from "../workflow/workflow";
import type { CompiledTripwire } from "./compile";
import * as TripwireMachine from "./tripwire-machine";

// Each tripwire tracked by its own state machine; state advances only via reducer, not on pipeline completion

export interface EntityRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilities: CommandCapabilities;
  readonly probes?: ProbeCapabilities;
  readonly onStatus?: (tripwireIndex: number, state: TripwireMachine.TripwireState) => void;
}

export interface EntityRunner {
  readonly observe: (lookup: PredicateLookup, now: number) => Promise<void>;
  // Rearm exhausted/fatalError tripwire (returns false if index out of bounds)
  readonly rearm: (tripwireIndex: number) => boolean;
}

interface TripwireInstance {
  readonly predicate: CompiledTripwire["predicate"];
  readonly machine: Machine.Machine<
    unknown,
    never,
    TripwireMachine.TripwireState,
    TripwireMachine.Event,
    TripwireMachine.RunRecovery
  >;
  readonly logger: Logger.Tagged;
  // State in StateRef, not dispatch fold (recovery pipelines run for minutes; observations must see live state)
  readonly state: Machine.StateRef<TripwireMachine.TripwireState>;
}

// Readable transition message for service logs; onStatus receives full state
const describeTransition = (from: TripwireMachine.TripwireState, to: TripwireMachine.TripwireState): string =>
  match(to)
    .with({ tag: "healthy" }, () => (from.tag === "recovering" ? "recovery succeeded" : "predicate healthy again"))
    .with({ tag: "pending" }, () => "predicate unhealthy, grace period started")
    .with({ tag: "recovering" }, () => "grace elapsed, running recovery pipeline")
    .with({ tag: "exhausted" }, () => "recovery exhausted retries without success")
    .with({ tag: "fatalError" }, (s) => `recovery pipeline failed: ${format(s.error)}`)
    .exhaustive();

export const create = (compiledTripwires: readonly CompiledTripwire[], env: EntityRunnerEnv): EntityRunner => {
  const workflowEnv: WorkflowEnv = {
    logger: env.logger,
    capabilities: env.capabilities,
    probes: env.probes,
    workflows: env.workflows,
  };

  const instances: TripwireInstance[] = compiledTripwires.map((tripwire, index) => {
    const tripwireLogger = env.logger.child(`Recovery-Tripwire:${index}`);

    // Recheck predicate after pipeline (success ≠ healing); retries stop if device recovers mid-pipeline
    const runRecoveryFor = (lookup: PredicateLookup): TE.TaskEither<AppError, boolean> =>
      Retry.retryingUntil(
        tripwire.retryPolicy,
        tripwireLogger,
      )(
        pipe(
          // Lookup & probes in env enable `await` and `when` to distinguish healing from command success
          interpretPipeline(tripwire.pipeline)({ ...workflowEnv, lookup }),
          TE.map((ranOk) => ({ ranOk, recovered: tripwire.predicate(lookup) })),
          TE.tapIO(({ ranOk, recovered }) =>
            ranOk && !recovered
              ? tripwireLogger.warn("recovery pipeline completed successfully, but predicate is still false")
              : () => {},
          ),
          TE.map(({ recovered }) => recovered),
        ),
      );

    const onTransition: Machine.TransitionHook<unknown, never, TripwireMachine.TripwireState, TripwireMachine.Event> =
      (from, _event, to) => () => {
        if (from.tag === to.tag) return TE.right(undefined);

        tripwireLogger.info(describeTransition(from, to))();
        env.onStatus?.(index, to);
        return TE.right(undefined);
      };

    const machine = TripwireMachine.make(tripwire.graceMs, runRecoveryFor, onTransition);

    let state: TripwireMachine.TripwireState = TripwireMachine.initial;
    const ref: Machine.StateRef<TripwireMachine.TripwireState> = {
      get: () => state,
      set: (next) => {
        state = next;
      },
    };

    return { predicate: tripwire.predicate, machine, logger: tripwireLogger, state: ref };
  });

  const observeInstance = async (instance: TripwireInstance, lookup: PredicateLookup, now: number): Promise<void> => {
    const healthy = instance.predicate(lookup);
    const result = await Machine.dispatchTo(instance.machine)(instance.state)({
      tag: "observe",
      healthy,
      now,
      lookup,
    })(undefined)();

    // Pipeline errors are fatalError transitions, not dispatch failures; this is a safety net
    if (E.isLeft(result)) instance.logger.error(`dispatch failed unexpectedly: ${format(result.left)}`)();
  };

  // Tripwires observed in parallel, not sequentially (avoids blocking one by another's pipeline)
  const observe = async (lookup: PredicateLookup, now: number): Promise<void> => {
    await Promise.all(instances.map((instance) => observeInstance(instance, lookup, now)));
  };

  const reset = (tripwireIndex: number): boolean => {
    const instance = instances[tripwireIndex];
    if (!instance) return false;

    const previous = instance.state.get();
    instance.state.set(TripwireMachine.initial);
    if (previous.tag !== "healthy") env.onStatus?.(tripwireIndex, TripwireMachine.initial);
    return true;
  };

  return { observe, rearm: reset };
};
