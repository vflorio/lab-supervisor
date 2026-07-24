import * as E from "fp-ts/Either";
import { type AppError, format } from "../errors";
import type * as Logger from "../logger";
import type { PredicateLookup } from "../predicates/expression";
import * as Retry from "../retry/retry";
import * as Machine from "../state-machine/machine";
import type { CommandCapabilities, WorkflowEnv } from "../workflow/interpreter";
import { interpretPipeline } from "../workflow/pipeline-interpreter";
import type { Workflow } from "../workflow/workflow";
import type { CompiledLevel } from "./compile";
import * as LevelMachine from "./level-machine";

// -------------------------------------------------------------------------------------
// Guida tutti i livelli di una RecoveryPolicy per una singola entità
// (già risolta a un target/capabilities concreti dal chiamante).
// -------------------------------------------------------------------------------------

export interface EntityRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilities: CommandCapabilities;
}

export interface EntityRunner {
  readonly observe: (lookup: PredicateLookup, now: number) => Promise<void>;
}

interface LevelInstance {
  readonly predicate: CompiledLevel["predicate"];
  readonly machine: Machine.Machine<
    unknown,
    AppError,
    LevelMachine.LevelState,
    LevelMachine.Observe,
    LevelMachine.RunRecovery
  >;
  readonly logger: Logger.Tagged;
  state: LevelMachine.LevelState;
}

export const create = (compiledLevels: readonly CompiledLevel[], env: EntityRunnerEnv): EntityRunner => {
  const workflowEnv: WorkflowEnv = {
    logger: env.logger,
    capabilities: env.capabilities,
    workflows: env.workflows,
  };

  const instances: LevelInstance[] = compiledLevels.map((level, index) => {
    const levelLogger = env.logger.child(`Recovery-Level:${index}`);

    const runWithRetry = Retry.retryingUntil(
      level.retryPolicy,
      levelLogger,
    )(interpretPipeline(level.pipeline)(workflowEnv));

    const machine = LevelMachine.make(level.graceMs, runWithRetry, (succeeded) =>
      levelLogger.info(succeeded ? "recovery succeeded" : "recovery exhausted retries without success")(),
    );

    return { predicate: level.predicate, machine, logger: levelLogger, state: LevelMachine.initial };
  });

  const observe = async (lookup: PredicateLookup, now: number): Promise<void> => {
    for (const instance of instances) {
      const healthy = instance.predicate(lookup);
      const result = await Machine.dispatch(instance.machine)(instance.state, { tag: "observe", healthy, now })(
        undefined,
      )();

      if (E.isRight(result)) {
        instance.state = result.right;
      } else {
        instance.logger.error(`dispatch failed: ${format(result.left)}`)();
      }
    }
  };

  return { observe };
};
