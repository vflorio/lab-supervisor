import * as E from "fp-ts/Either";
import { type AppError, format } from "../errors";
import type * as Logger from "../logger";
import type { PredicateLookup } from "../predicates/expression";
import * as Retry from "../retry/retry";
import * as Machine from "../state-machine/machine";
import type { CommandCapabilities, WorkflowEnv } from "../workflow/interpreter";
import { interpretPipeline } from "../workflow/pipeline-interpreter";
import type { Workflow } from "../workflow/workflow";
import type { CompiledTripwire } from "./compile";
import * as TripwireMachine from "./tripwire-machine";

// -------------------------------------------------------------------------------------
// Guida tutti i livelli di una RecoveryPolicy per una singola entità
// (già risolta a un target/capabilities concreti dal chiamante).
// -------------------------------------------------------------------------------------

export interface StatusEvent {
  readonly state: TripwireMachine.TripwireState["tag"];
  readonly outcome?: "succeeded" | "exhausted";
}

export interface EntityRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilities: CommandCapabilities;
  // Notifica opzionale ad ogni transizione di stato e ad ogni esito di recovery, per un
  // tripwire (indice) di questa entità - usata dal chiamante per alimentare un feed di stato
  // (packages/core/src/recovery/status.ts), non necessaria al funzionamento del motore stesso.
  readonly onStatus?: (tripwireIndex: number, event: StatusEvent) => void;
}

export interface EntityRunner {
  readonly observe: (lookup: PredicateLookup, now: number) => Promise<void>;
}

interface TripwireInstance {
  readonly predicate: CompiledTripwire["predicate"];
  readonly machine: Machine.Machine<
    unknown,
    AppError,
    TripwireMachine.TripwireState,
    TripwireMachine.Observe,
    TripwireMachine.RunRecovery
  >;
  readonly logger: Logger.Tagged;
  state: TripwireMachine.TripwireState;
}

export const create = (compiledTripwires: readonly CompiledTripwire[], env: EntityRunnerEnv): EntityRunner => {
  const workflowEnv: WorkflowEnv = {
    logger: env.logger,
    capabilities: env.capabilities,
    workflows: env.workflows,
  };

  const instances: TripwireInstance[] = compiledTripwires.map((tripwire, index) => {
    const tripwireLogger = env.logger.child(`Recovery-Tripwire:${index}`);

    const runWithRetry = Retry.retryingUntil(
      tripwire.retryPolicy,
      tripwireLogger,
    )(interpretPipeline(tripwire.pipeline)(workflowEnv));

    const machine = TripwireMachine.make(tripwire.graceMs, runWithRetry, (succeeded) => {
      tripwireLogger.info(succeeded ? "recovery succeeded" : "recovery exhausted retries without success")();
      env.onStatus?.(index, { state: "fired", outcome: succeeded ? "succeeded" : "exhausted" });
    });

    return { predicate: tripwire.predicate, machine, logger: tripwireLogger, state: TripwireMachine.initial };
  });

  const observe = async (lookup: PredicateLookup, now: number): Promise<void> => {
    for (const [index, instance] of instances.entries()) {
      const healthy = instance.predicate(lookup);
      const previousTag = instance.state.tag;
      const result = await Machine.dispatch(instance.machine)(instance.state, { tag: "observe", healthy, now })(
        undefined,
      )();

      if (E.isRight(result)) {
        instance.state = result.right;
        if (result.right.tag !== previousTag) env.onStatus?.(index, { state: result.right.tag });
      } else {
        instance.logger.error(`dispatch failed: ${format(result.left)}`)();
      }
    }
  };

  return { observe };
};
