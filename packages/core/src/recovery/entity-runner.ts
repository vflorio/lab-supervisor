import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
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
// Elabora ogni tripwire di un'entità (es. un device) in base al proprio predicate,
// alla propria macchina a stati e al proprio logger.
// -------------------------------------------------------------------------------------

export type StatusEvent =
  | { readonly type: "transition"; readonly state: TripwireMachine.TripwireState["tag"] }
  | { readonly type: "outcome"; readonly outcome: "succeeded" | "exhausted" };

export interface EntityRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilities: CommandCapabilities;
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

    // Il predicate va ricontrollato dopo la pipeline: "succeeded" nella pipeline significa solo che
    // i comandi sono stati eseguiti senza errori, non che il device sia di nuovo sano (es. reboot
    // inviato con successo ma device non ancora tornato raggiungibile) - per questo il lookup, con
    // cui si rivaluta il predicate, arriva ad ogni tentativo invece di essere catturato una volta sola.
    const runRecoveryFor = (lookup: PredicateLookup): TE.TaskEither<AppError, boolean> =>
      Retry.retryingUntil(
        tripwire.retryPolicy,
        tripwireLogger,
      )(
        pipe(
          interpretPipeline(tripwire.pipeline)(workflowEnv),
          TE.map((ranOk) => ({ ranOk, recovered: ranOk && tripwire.predicate(lookup) })),
          TE.tapIO(({ ranOk, recovered }) =>
            ranOk && !recovered
              ? tripwireLogger.warn("recovery pipeline completed successfully, but predicate is still false")
              : () => {},
          ),
          TE.map(({ recovered }) => recovered),
        ),
      );

    const machine = TripwireMachine.make(tripwire.graceMs, runRecoveryFor, (succeeded) => {
      tripwireLogger.info(succeeded ? "recovery succeeded" : "recovery exhausted retries without success")();
      env.onStatus?.(index, { type: "outcome", outcome: succeeded ? "succeeded" : "exhausted" });
    });

    return { predicate: tripwire.predicate, machine, logger: tripwireLogger, state: TripwireMachine.initial };
  });

  const observe = async (lookup: PredicateLookup, now: number): Promise<void> => {
    for (const [index, instance] of instances.entries()) {
      const healthy = instance.predicate(lookup);
      const previousTag = instance.state.tag;
      const result = await Machine.dispatch(instance.machine)(instance.state, {
        tag: "observe",
        healthy,
        now,
        lookup,
      })(undefined)();

      if (E.isRight(result)) {
        instance.state = result.right;
        if (result.right.tag !== previousTag) env.onStatus?.(index, { type: "transition", state: result.right.tag });
      } else {
        instance.logger.error(`dispatch failed: ${format(result.left)}`)();
      }
    }
  };

  return { observe };
};
