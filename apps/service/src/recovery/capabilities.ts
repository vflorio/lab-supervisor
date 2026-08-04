import type * as AndroidBridgeMachine from "@supervisor/core/android-bridge/machine";
import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import type * as Network from "@supervisor/core/network";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import type * as WorkflowProbe from "@supervisor/core/workflow/probe";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type * as AndroidBridge from "../android-bridge/runner";
import * as Registry from "../registry";
import * as Workflow from "../workflow";
import * as Target from "./target";

// CommandCapabilities for a RecoveryPolicy; resolves ADB target fresh per command (no cache needed)

export interface Env {
  readonly logger: Logger.Tagged;
  readonly registryEnv: Registry.RegistrySyncEnv;
  readonly workflowEnv: Workflow.WorkflowRunnerEnv;
  readonly androidBridge: AndroidBridge.Handle;
  readonly waitForDeviceTimeoutMs: number;
}

// Bridge lifecycle: shared by commands and probes (both resolve same entityId, same error reporting)
const bridgeFor = (domain: string, env: Env, entityId: string) => {
  // Resolve bridge id for entityId (none if not tracked, not an error)
  const androidBridgeId = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, O.Option<string>> =>
    pipe(
      Registry.read(env.registryEnv),
      TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
      TE.map((db) => Target.resolveAndroidBridgeId(domain, entityId, db.lab)),
    );

  // Notify bridge event if tracked (best-effort; unresolvable id or failure doesn't affect command outcome)
  const notifyBridge = (event: AndroidBridgeMachine.AndroidBridgeEvent): TE.TaskEither<never, void> =>
    pipe(
      androidBridgeId(),
      TE.flatMap(
        (id): TE.TaskEither<never, void> =>
          O.isSome(id) ? env.androidBridge.dispatch(id.value, event) : TE.right(undefined),
      ),
      TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
    );

  // Translate command failure to bridge event (only CommandTimeout is actionable); use tapError, not flatMap
  const remediate =
    (kind: string) =>
    (error: WorkflowInterpreter.WorkflowError): TE.TaskEither<never, void> =>
      match(error.cause)
        .with({ type: "CommandTimeout" }, () =>
          notifyBridge({ _tag: "TransportSuspect", reason: `${kind} timed out: ${error.message}` }),
        )
        .otherwise((): TE.TaskEither<never, void> => TE.right(undefined));

  const resolveEndpoint = <A>(
    use: (target: Network.Endpoint) => TE.TaskEither<WorkflowInterpreter.WorkflowError, A>,
  ): TE.TaskEither<WorkflowInterpreter.WorkflowError, A> =>
    pipe(
      Registry.read(env.registryEnv),
      TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
      TE.flatMapOption(
        (db) => Target.resolveTarget(domain, entityId, db.lab),
        () => WorkflowInterpreter.workflowError(`No ADB target resolved for ${domain}/${entityId}`),
      ),
      TE.flatMap(use),
    );

  return { androidBridgeId, notifyBridge, remediate, resolveEndpoint };
};

export const capabilitiesFor =
  (domain: string, env: Env) =>
  (entityId: string): WorkflowInterpreter.CommandCapabilities => {
    const { androidBridgeId, notifyBridge, remediate, resolveEndpoint } = bridgeFor(domain, env, entityId);

    // Gate: reject early if AndroidBridge knows camera won't accept commands; in-memory state can give false negatives but never false positives
    const requireAccepting = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> =>
      pipe(
        androidBridgeId(),
        TE.flatMap((id) => {
          if (O.isNone(id)) return TE.right(undefined);

          return env.androidBridge.acceptsCommands(id.value)
            ? TE.right(undefined)
            : TE.left(
                WorkflowInterpreter.workflowError(
                  `Camera "${id.value}" is not connected (AndroidBridge not Idle), refusing command`,
                ),
              );
        }),
      );

    // `gate: false` per i comandi che devono funzionare anche a camera non Idle (reboot):
    // gatarli rifiuterebbe esattamente ciò di cui una recovery ha bisogno.
    const withTarget = <A>(
      run: (
        capabilities: WorkflowInterpreter.CommandCapabilities,
      ) => TE.TaskEither<WorkflowInterpreter.WorkflowError, A>,
      gate: boolean = true,
    ): TE.TaskEither<WorkflowInterpreter.WorkflowError, A> =>
      pipe(
        gate ? requireAccepting() : TE.right(undefined),
        TE.flatMap(() => resolveEndpoint((target) => run(Workflow.makeCapabilities(env.workflowEnv, target)))),
        TE.tapError(remediate("command")),
      );

    // Unlike other commands, waitForDevice doesn't trust ADB port (may freeze post-reboot); waits for bridge Idle
    const waitForDevice = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> =>
      pipe(
        androidBridgeId(),
        TE.flatMapOption(
          (id) => id,
          () => WorkflowInterpreter.workflowError(`No Android Bridge id resolved for ${domain}/${entityId}`),
        ),
        TE.flatMap((cameraId) =>
          pipe(
            env.androidBridge.awaitIdle(cameraId, env.waitForDeviceTimeoutMs),
            TE.mapLeft((error) => WorkflowInterpreter.workflowError(`waitForDevice: ${Errors.format(error)}`)),
          ),
        ),
      );

    // Notify bridge on successful reboot (expected disconnect); prevents stale state in next waitForDevice
    const reboot = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> =>
      pipe(
        withTarget((c) => c.reboot(), false),
        TE.tap(() => notifyBridge({ _tag: "RebootDispatched" })),
      );

    return {
      restartApp: (packageId) => withTarget((c) => c.restartApp(packageId)),
      ensureActivity: (packageId, activity) => withTarget((c) => c.ensureActivity(packageId, activity)),
      openUrl: (url) => withTarget((c) => c.openUrl(url)),
      openDeveloperSettings: () => withTarget((c) => c.openDeveloperSettings()),
      reboot,
      wakeUp: () => withTarget((c) => c.wakeUp()),
      inputTap: (coords) => withTarget((c) => c.inputTap(coords)),
      waitForDevice,
    };
  };

// Probes for a RecoveryPolicy; same target resolution as commands but no AndroidBridge gate (reads are safe, and gating would block decision conditions)
export const probesFor =
  (domain: string, env: Env) =>
  (entityId: string): WorkflowProbe.ProbeCapabilities => {
    const { remediate, resolveEndpoint } = bridgeFor(domain, env, entityId);

    const withTarget = <A>(
      read: (probes: WorkflowProbe.ProbeCapabilities) => TE.TaskEither<WorkflowInterpreter.WorkflowError, A>,
    ): TE.TaskEither<WorkflowInterpreter.WorkflowError, A> =>
      pipe(
        resolveEndpoint((target) => read(Workflow.makeProbes(env.workflowEnv, target))),
        TE.tapError(remediate("probe")),
      );

    return {
      screenOn: () => withTarget((p) => p.screenOn()),
      keyguardShowing: () => withTarget((p) => p.keyguardShowing()),
      activityResumed: (activity) => withTarget((p) => p.activityResumed(activity)),
      orientation: (expected) => withTarget((p) => p.orientation(expected)),
    };
  };
