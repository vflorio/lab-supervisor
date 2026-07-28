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

// -------------------------------------------------------------------------------------
// CommandCapabilities per una RecoveryPolicy: risolve il target ADB dell'entityId (via
// resolveTarget) leggendo il registry FRESCO ad ogni singolo comando eseguito, mai da una
// cache - il registry è già economico da leggere (Registry.read, mai Registry.sync qui) e una
// pipeline di recovery esegue pochi comandi per tentativo, quindi non serve alcun loop/cache
// dedicato solo per questo.
// -------------------------------------------------------------------------------------

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
    // Risolve l'id camera dell'AndroidBridgeOrchestrator per questo entityId - condiviso da
    // waitForDevice (per attendere la riconnessione) e da notifyBridge sotto. O.none per
    // un'entità non tracciata dall'AndroidBridge: tutti i chiamanti degradano a no-op in quel
    // caso, non è un errore.
    const androidBridgeId = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, O.Option<string>> =>
      pipe(
        Registry.read(env.registryEnv),
        TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
        TE.map((db) => resolveAndroidBridgeId(domain, entityId, db.lab)),
      );

    // Notifica alla macchina della camera un evento derivato dall'esito di un comando, se questa
    // entità è tracciata dall'AndroidBridge. Best-effort in entrambe le direzioni: un id non
    // risolvibile è un no-op, e un fallimento qui non deve mai alterare l'esito del comando.
    const notifyBridge = (event: AndroidBridge.AndroidBridgeEvent): TE.TaskEither<never, void> =>
      pipe(
        androidBridgeId(),
        TE.flatMap(
          (id): TE.TaskEither<never, void> =>
            O.isSome(id) ? env.androidBridge.dispatch(id.value, event) : TE.right(undefined),
        ),
        TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
      );

    // Traduce il fallimento di un comando in un evento per la macchina della camera. Oggi una
    // sola causa è azionabile - un CommandTimeout significa transport ADB incastrato (`adb
    // devices` lo riporta raggiungibile ma non risponde più, caso che la liveness-detection non
    // può vedere) - ma la forma è quella giusta: aggiungere una regola è un arm in più, non
    // nuovo plumbing. Va agganciato con TE.tapError, mai con TE.flatMap: non deve sostituire
    // l'errore originale del comando.
    const remediate = (error: WorkflowInterpreter.WorkflowError): TE.TaskEither<never, void> =>
      match(error.cause)
        .with({ type: "CommandTimeout" }, () =>
          notifyBridge({ _tag: "TransportSuspect", reason: `command timed out: ${error.message}` }),
        )
        .otherwise((): TE.TaskEither<never, void> => TE.right(undefined));

    // Gate: rifiuta subito un comando se l'AndroidBridge sa già che questa camera non accetta
    // comandi (qualunque stato diverso da Idle), invece di tentare comunque lo shell-out diretto e
    // aspettare fino a DEFAULT_COMMAND_TIMEOUT_MS per scoprirlo. Best-effort nella direzione
    // opposta: un id non risolvibile (dominio non tracciato dall'AndroidBridge) non blocca -
    // l'assenza di informazione non è motivo di rifiuto. Nota: acceptsCommands riflette lo stato
    // in-memory dell'orchestrator, aggiornato solo dal tick di reconcile (5s)/poll adb (10s) -
    // può quindi rifiutare un comando che nel frattempo sarebbe riuscito (falso negativo
    // accettabile, c'è comunque retry a monte) ma non l'opposto.
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

    // `gate: false` per i comandi pensati per funzionare proprio quando la camera NON è Idle
    // (reboot - waitForDevice bypassa withTarget del tutto, vedi sotto) - gatarli rischierebbe di
    // rifiutare esattamente i comandi di cui una recovery ha bisogno quando il device risulta già
    // Disconnected.
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

    // A differenza degli altri comandi (shell-out diretto sul target ADB), waitForDevice non
    // deve fidarsi di una porta ADB potenzialmente congelata dopo un reboot: risolve l'id camera
    // dell'AndroidBridgeOrchestrator e attende che torni Idle (mDNS + re-pairing, già gestito da
    // quel layer), con un timeout intrinseco - vedi RECOVERY-REBOOT-LOOP.md, punto 1.
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

    // Un reboot riuscito è una disconnessione ATTESA: senza dirlo alla macchina, lo stato lì
    // resterebbe Idle (stale) finché il poll di adbDeviceStream non se ne accorge da solo (fino a
    // tracking.adb.polling, oggi 10s) - e un waitForDevice eseguito subito dopo (vedi
    // open-chrome-reboot) leggerebbe quello stato stale e tornerebbe SUBITO, senza aver mai
    // aspettato davvero.
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
