import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger";
import * as Network from "@supervisor/core/network";
import type * as Predicates from "@supervisor/core/predicates/index";
import * as Recovery from "@supervisor/core/recovery/index";
import type * as Retry from "@supervisor/core/retry/retry";
import type * as Db from "@supervisor/core/services/db";
import type * as Shell from "@supervisor/core/shell";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as WorkflowRunner from "./workflow";

// -------------------------------------------------------------------------------------
// Wiring del motore di recovery nel servizio reale: risolve l'entityId di un
// dominio tracciato in un target ADB concreto, poi delega a Recovery.start
// TODO: la policy viene loggata e saltata, non gestita in modo silenziosamente scorretto
// -------------------------------------------------------------------------------------

const ADB_DOMAIN = "adb";
const SUITEST_CAMERA_DOMAIN = "suitest-camera";

// Risolve ogni videoCaptureDeviceId noto in registry al suo target ADB,
// solo per le camere che hanno sia `videoCaptureDeviceId` che `adbId` valorizzati
export const cameraTargetsFromRegistry = (registry: Db.LabRegistry): Readonly<Record<string, Network.Endpoint>> => {
  const entries: Array<readonly [string, Network.Endpoint]> = [];

  for (const camera of Object.values(registry.cameras)) {
    if (O.isNone(camera.videoCaptureDeviceId) || O.isNone(camera.adbId)) continue;

    const adbEntry = registry.adb[camera.adbId.value];
    if (adbEntry) entries.push([camera.videoCaptureDeviceId.value, adbEntry.target]);
  }

  return Object.fromEntries(entries);
};

// Capabilities "sempre in errore", usata quando un entityId non risolve a nessun target noto:
// il livello tenta comunque, esaurisce il retry e si arrende in modo pulito (loggato),
// invece di andare in crash per un target mancante.
const unresolvedCapabilities = (entityId: string): WorkflowInterpreter.CommandCapabilities => {
  const error = TE.left(WorkflowInterpreter.workflowError(`No ADB target resolved for entity "${entityId}"`));

  return {
    restartApp: () => error,
    ensureActivity: () => error,
    openUrl: () => error,
    openDeveloperSettings: () => error,
    reboot: () => error,
    wakeUp: () => error,
    inputTap: () => error,
    waitForDevice: () => error,
    waitForActivity: () => error,
  };
};

export interface RecoveryEnv {
  readonly logger: Logger.Tagged;
  readonly stream: Predicates.PredicateFeed;
  readonly workflows: readonly Workflow[];
  readonly spawn: Shell.Spawn;
  readonly tickPolicy: Retry.Policy;
  // Snapshot aggiornato dal chiamante (vedi service.ts) - Suitest video-capture-device id -> target ADB
  readonly cameraTargets: () => Readonly<Record<string, Network.Endpoint>>;
}

const capabilitiesForDomain = (
  domain: string,
  env: RecoveryEnv,
): ((entityId: string) => WorkflowInterpreter.CommandCapabilities) | null => {
  const runnerEnv: WorkflowRunner.WorkflowRunnerEnv = {
    logger: env.logger,
    workflows: env.workflows,
    spawn: env.spawn,
  };

  if (domain === ADB_DOMAIN) {
    return (entityId) =>
      E.match(
        () => unresolvedCapabilities(entityId),
        (target: Network.Endpoint) => WorkflowRunner.makeCapabilities(runnerEnv, target),
      )(Network.decode(entityId));
  }

  if (domain === SUITEST_CAMERA_DOMAIN) {
    return (entityId) => {
      const target = env.cameraTargets()[entityId];
      return target ? WorkflowRunner.makeCapabilities(runnerEnv, target) : unresolvedCapabilities(entityId);
    };
  }

  return null;
};

export const startAll = (
  policies: readonly Recovery.RecoveryPolicy[],
  env: RecoveryEnv,
): readonly Recovery.RecoveryRunnerHandle[] => {
  const handles: Recovery.RecoveryRunnerHandle[] = [];

  for (const policy of policies) {
    const capabilitiesFor = capabilitiesForDomain(policy.domain, env);
    if (!capabilitiesFor) {
      env.logger.warn(
        `Recovery policy "${policy.label}": domain "${policy.domain}" has no ADB-resolvable capabilities yet, skipping`,
      )();
      continue;
    }

    const result = Recovery.start(policy, {
      logger: env.logger.child(policy.label),
      stream: env.stream,
      workflows: env.workflows,
      tickPolicy: env.tickPolicy,
      capabilitiesFor,
    });

    if (E.isLeft(result)) {
      env.logger.error(`Recovery policy "${policy.label}" misconfigured: ${Errors.format(result.left)}`)();
      continue;
    }

    handles.push(result.right);
  }

  return handles;
};
