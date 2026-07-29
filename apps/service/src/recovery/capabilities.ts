import type * as AndroidBridge from "@supervisor/core/android-bridge/machine";
import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type * as AndroidBridgeOrchestrator from "../android-bridge";
import * as Registry from "../registry";
import * as Workflow from "../workflow";
import { resolveAndroidBridgeId, resolveTarget } from "./target";

// CommandCapabilities per una RecoveryPolicy: risolve il target ADB dell'entityId leggendo il
// registry fresco ad ogni comando, mai da una cache - Registry.read è già economico e una
// pipeline esegue pochi comandi per tentativo, non serve un cache dedicato.

export interface Env {
  readonly logger: Logger.Tagged;
  readonly registryEnv: Registry.RegistrySyncEnv;
  readonly workflowEnv: Workflow.WorkflowRunnerEnv;
  readonly androidBridge: AndroidBridgeOrchestrator.Handle;
  readonly waitForDeviceTimeoutMs: number;
}

export const capabilitiesFor =
  (domain: string, env: Env) =>
  (entityId: string): WorkflowInterpreter.CommandCapabilities => {
    // Risolve l'id camera per questo entityId; O.none se non tracciata (no-op per i chiamanti,
    // non un errore).
    const androidBridgeId = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, O.Option<string>> =>
      pipe(
        Registry.read(env.registryEnv),
        TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
        TE.map((db) => resolveAndroidBridgeId(domain, entityId, db.lab)),
      );

    // Notifica un evento alla macchina della camera, se tracciata. Best-effort: un id non
    // risolvibile o un fallimento qui non alterano mai l'esito del comando.
    const notifyBridge = (event: AndroidBridge.AndroidBridgeEvent): TE.TaskEither<never, void> =>
      pipe(
        androidBridgeId(),
        TE.flatMap(
          (id): TE.TaskEither<never, void> =>
            O.isSome(id) ? env.androidBridge.dispatch(id.value, event) : TE.right(undefined),
        ),
        TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
      );

    // Traduce il fallimento di un comando in un evento per la macchina; oggi solo CommandTimeout
    // è azionabile (transport ADB incastrato, invisibile alla liveness-detection). Va agganciato
    // con TE.tapError, mai TE.flatMap: non deve sostituire l'errore del comando.
    const remediate = (error: WorkflowInterpreter.WorkflowError): TE.TaskEither<never, void> =>
      match(error.cause)
        .with({ type: "CommandTimeout" }, () =>
          notifyBridge({ _tag: "TransportSuspect", reason: `command timed out: ${error.message}` }),
        )
        .otherwise((): TE.TaskEither<never, void> => TE.right(undefined));

    // Gate: rifiuta subito un comando se l'AndroidBridge sa già che la camera non accetta
    // comandi, invece di scoprirlo dopo un timeout pieno. Un id non risolvibile non blocca.
    // Lo stato è in-memory e non istantaneo: può dare un falso negativo (accettabile, c'è
    // retry a monte) ma mai un falso positivo.
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
        TE.flatMap(() =>
          pipe(
            Registry.read(env.registryEnv),
            TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
          ),
        ),
        TE.flatMapOption(
          (db) => resolveTarget(domain, entityId, db.lab),
          () => WorkflowInterpreter.workflowError(`No ADB target resolved for ${domain}/${entityId}`),
        ),
        TE.map((target) => Workflow.makeCapabilities(env.workflowEnv, target)),
        TE.flatMap(run),
        TE.tapError(remediate),
      );

    // A differenza degli altri comandi, waitForDevice non si fida della porta ADB (può essere
    // congelata dopo un reboot): attende che la camera torni Idle via AndroidBridge.
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

    // Un reboot riuscito è una disconnessione attesa: senza notificarlo, lo stato camera
    // resterebbe Idle (stale) finché il poll non se ne accorge da solo, e un waitForDevice
    // successivo tornerebbe subito senza aver atteso davvero.
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
      waitForActivity: (activity) => withTarget((c) => c.waitForActivity(activity)),
    };
  };
