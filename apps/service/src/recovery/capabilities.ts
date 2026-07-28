import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as WorkflowInterpreter from "@supervisor/core/workflow/interpreter";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
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
    // waitForDevice (per interrogare acceptsCommands), da reboot e da remediateIfTimedOut sotto.
    // O.none per un'entità non tracciata dall'AndroidBridge: tutti i chiamanti degradano a no-op
    // in quel caso, non è un errore.
    const androidBridgeId = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, O.Option<string>> =>
      pipe(
        Registry.read(env.registryEnv),
        TE.mapLeft((error) => WorkflowInterpreter.workflowError(`Registry read failed: ${Errors.format(error)}`)),
        TE.map((db) => resolveAndroidBridgeId(domain, entityId, db.lab)),
      );

    // Un comando che va in CommandTimeoutError (mai un fallimento "normale" come app/activity
    // non trovata, vedi WorkflowError#timedOut) è il segnale che un transport ADB è incastrato:
    // adb devices continua a riportarlo raggiungibile ma non risponde più, caso non rilevabile
    // da ConnectionLost (vedi TODO "Disconnect+reconnect esplicito su comando fallito"). Non
    // sostituisce mai l'errore originale del comando (best-effort, sempre TE.right/never) - va
    // agganciato con TE.tapError, non TE.flatMap, altrimenti maschererebbe il fallimento vero.
    const remediateIfTimedOut = (error: WorkflowInterpreter.WorkflowError): TE.TaskEither<never, void> =>
      error.timedOut
        ? pipe(
            androidBridgeId(),
            TE.flatMap(
              (id): TE.TaskEither<never, void> =>
                O.isSome(id)
                  ? env.androidBridge.forceReconnect(id.value, `command timed out: ${error.message}`)
                  : TE.right(undefined),
            ),
            TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
          )
        : TE.right(undefined);

    // Gate: rifiuta subito un comando se l'AndroidBridge sa già che questa camera non accetta
    // comandi (Connecting/Disconnected), invece di tentare comunque lo shell-out diretto e
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
        TE.tapError(remediateIfTimedOut),
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

    // Il reboot invalida esplicitamente lo stato Idle dell'AndroidBridgeOrchestrator: senza
    // questo, lo stato lì resterebbe "Idle" (stale) finché il prossimo poll di adbDeviceStream
    // non se ne accorge da solo (fino a tracking.adb.polling, oggi 10s) - e un waitForDevice
    // eseguito subito dopo (vedi open-chrome-reboot) leggerebbe quello stato stale e tornerebbe
    // SUBITO, senza aver mai aspettato davvero. Best-effort: un fallimento nel risolvere l'id
    // (o l'assenza di un id) non deve far fallire un reboot già riuscito.
    const invalidateAfterReboot: TE.TaskEither<never, void> = pipe(
      androidBridgeId(),
      TE.flatMap(
        (id): TE.TaskEither<never, void> =>
          O.isSome(id) ? env.androidBridge.markDisconnected(id.value, "reboot dispatched") : TE.right(undefined),
      ),
      TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
    );

    const reboot = (): TE.TaskEither<WorkflowInterpreter.WorkflowError, void> =>
      pipe(
        withTarget((c) => c.reboot(), false),
        TE.tap(() => invalidateAfterReboot),
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
