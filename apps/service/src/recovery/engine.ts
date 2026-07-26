import type * as ConfigModel from "@supervisor/core/config";
import type * as Logger from "@supervisor/core/logger";
import type * as Predicates from "@supervisor/core/predicates/index";
import * as Recovery from "@supervisor/core/recovery/index";
import type { PolicyDecodeError } from "@supervisor/core/retry/codec";
import * as RetryPolicy from "@supervisor/core/retry/retry";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as Node from "../node";
import type * as Workflow from "../workflow";
import * as Capabilities from "./capabilities";

// -------------------------------------------------------------------------------------
// Composizione a livello di ActiveLifecycle: una Recovery.start per ogni RecoveryPolicy
// configurata (config.recovery, opzionale) - ognuna osserva solo il proprio dominio (Recovery.start
// filtra già sul policy.domain) sullo stesso PredicateFeed, ed emette sullo stesso RecoveryStream.
// -------------------------------------------------------------------------------------

const TICK_POLICY: RetryPolicy.Policy = RetryPolicy.constantDelay(1000);

export interface Env {
  readonly logger: Logger.Tagged;
  readonly config: ConfigModel.Service;
  readonly predicateStream: Predicates.PredicateFeed;
  readonly recoveryStream: Recovery.RecoveryStream;
}

export type StartError = PolicyDecodeError;

export interface Handle {
  readonly stop: () => void;
}

export const start = (env: Env): E.Either<StartError, Handle> => {
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

  return pipe(
    env.config.recovery ?? [],
    E.traverseArray((policy) =>
      Recovery.start(policy, {
        logger: env.logger.child(`RecoveryPolicy:${policy.label}`),
        stream: env.predicateStream,
        workflows: env.config.workflows,
        capabilitiesFor: Capabilities.capabilitiesFor(policy.domain, capabilitiesEnv),
        tickPolicy: TICK_POLICY,
        onStatus: (entityId, tripwireIndex, event) =>
          env.recoveryStream.emit({ policy: policy.label, domain: policy.domain, entityId, tripwireIndex, ...event }),
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
