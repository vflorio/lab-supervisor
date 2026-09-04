import type * as TE from "fp-ts/TaskEither";
import type * as Activation from "./activation/schedule";
import type { ActivityFeed } from "./activity/stream";
import type * as Adb from "./adapters/adb/shell";
import type * as ConfigModel from "./config";
import type * as Db from "./db";
import type * as Errors from "./errors";
import type { FactStream } from "./fact/stream";
import type { LogFeed } from "./logger/log-stream";
import type * as Logger from "./logger/logger";
import type * as Network from "./network";
import type { NotifyFeed } from "./notify/stream";
import type * as RecoveryModel from "./recovery/model";
import type { RecoveryFeed } from "./recovery/status";
import type { LoopFeed } from "./task-runner/stream";
import type * as WorkflowInterpreter from "./workflow/interpreter";
import type * as Workflow from "./workflow/workflow";

// Funzionalità esposte su tRPC

export interface AndroidDeviceSnapshot {
  readonly target: string;
  readonly status: string;
}

interface AndroidBridge {
  readonly devices: () => TE.TaskEither<Adb.Error, readonly AndroidDeviceSnapshot[]>;
  readonly reboot: (target: Network.Endpoint) => TE.TaskEither<Adb.Error, void>;
  readonly restartServer: () => TE.TaskEither<Adb.Error, void>;
  // Feed alimentato dal tracker ADB
  readonly devicesFeed: {
    readonly subscribe: (listener: (devices: readonly AndroidDeviceSnapshot[]) => void) => () => void;
    readonly snapshot: () => readonly AndroidDeviceSnapshot[];
  };
}

// Provisioning dell'agent Android. Nessuno dei due metodi restituisce lo stato letto: lo
// pubblicano entrambi come fatti del dominio `agent` (una riga per check), che la UI riceve
// gia' dal feed `tracking`. Un secondo canale per lo stesso dato divergerebbe e basta.
interface AgentProvisioning {
  // `false` se manca la sezione `provisioning` in config: la UI mostra "non configurato"
  // invece di offrire un bottone che fallirebbe a ogni click.
  readonly isConfigured: boolean;
  readonly refresh: (target: Network.Endpoint) => TE.TaskEither<Errors.AppError, void>;
  // Converge il device allo stato provisionato (install/grant/doze/launch, solo i passi
  // mancanti). Manuale: nessun poll la invoca. Web -> Service
  readonly provision: (target: Network.Endpoint) => TE.TaskEither<Errors.AppError, void>;
}

interface DeviceRegistry {
  readonly getAll: () => TE.TaskEither<Db.DbError, Db.Database>;

  readonly candyboxes: {
    readonly update: (input: Db.CandyboxUpdateInput) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly add: (entry: Db.CandyboxEntry) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly remove: (id: string) => TE.TaskEither<Db.DbError, Db.Database>;
  };

  readonly cameras: {
    readonly update: (input: Db.CameraUpdateInput) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly add: (entry: Db.CameraEntry) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly remove: (id: string) => TE.TaskEither<Db.DbError, Db.Database>;
  };

  readonly tvs: {
    readonly update: (input: Db.TvUpdateInput) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly add: (entry: Db.TvEntry) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly remove: (deviceId: string) => TE.TaskEither<Db.DbError, Db.Database>;
  };

  readonly adb: {
    readonly update: (input: Db.AdbUpdateInput) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly add: (entry: Db.AdbEntry) => TE.TaskEither<Db.DbError, Db.Database>;
    readonly remove: (id: string) => TE.TaskEither<Db.DbError, Db.Database>;
  };
}

interface Settings {
  // Config già redatta (segreti mascherati) - non esporre mai la ServiceConfig raw fuori dal processo
  readonly getConfig: () => ConfigModel.Service;

  // In-memory soltanto: si perde al riavvio del service, non c'è ancora un writer su file.
  // Non ha effetto sull'activation runner già avviato (costruito una sola volta all'avvio,
  // vedi apps/service/src/service.ts) - solo su cosa restituisce getConfig da questo momento.
  readonly updateActivationSchedule: (schedule: Activation.ActivationSchedule) => ConfigModel.Service;

  // Sostituisce l'intero array `workflows` - stessa nota in-memory di updateActivationSchedule:
  // non ha effetto sui workflow già catturati da un `ActiveLifecycle` in corso (recovery pipeline,
  // lancio manuale via `runWorkflow`), vedi apps/service/src/service-lifecycle.ts.
  readonly updateWorkflows: (workflows: readonly Workflow.Workflow[]) => ConfigModel.Service;

  // Sostituisce l'intero array `recovery` - stessa nota in-memory: non ha effetto sull'engine
  // di recovery già avviato (RecoveryEngine.start viene chiamato una sola volta da
  // createActiveLifecycle), solo su cosa restituisce getConfig da questo momento.
  readonly updateRecovery: (policies: readonly RecoveryModel.RecoveryPolicy[]) => ConfigModel.Service;

  // Endomorfismo generico: applica un ConfigPatch e persiste su file (vedi `ConfigModel.modify`),
  // a differenza delle update* sopra che restano in-memory. Oggi solo i campi di `Infra`
  // (trpc/log/adb/tracking per intero, suitest/slack solo baseUrl/active) sono nel patch -
  // fallisce se la config non è stata caricata da file (es. `--config-url`).
  readonly setConfig: (
    patch: ConfigModel.ConfigPatch,
  ) => TE.TaskEither<ConfigModel.ConfigError | Errors.AppError, ConfigModel.Service>;
}

export interface Services {
  readonly android: AndroidBridge;
  readonly provisioning: AgentProvisioning;
  readonly registry: DeviceRegistry;
  readonly settings: Settings;
  // Questo serve per permettere di avere in logger transportato in HTTP (per loggare errori critici delle web-app)
  readonly logger: Logger.Tagged; // Web -> Service

  // Riarma il tripwire di un'entità dopo un esaurimento dei retry (intervento manuale) -
  // `false` se il servizio non è "active" (nessun motore di recovery in esecuzione) o se
  // l'entità/tripwire indicati non sono mai stati osservati. Web -> Service
  readonly recoveryReset: (policyLabel: string, entityId: string, tripwireIndex: number) => boolean;

  // Lancia manualmente un workflow (config `workflows`) contro l'ADB target assegnato a una
  // camera - `WorkflowError` se il servizio non è "active", la camera non ha un ADB target
  // assegnato, o il workflow non è configurato. Web -> Service
  readonly runWorkflow: (
    cameraId: string,
    workflowName: string,
  ) => TE.TaskEither<WorkflowInterpreter.WorkflowError, void>;

  // Feed dei log di servizio
  readonly logs: LogFeed; // Service -> Web
  // Feed dei predicati di tracking
  readonly tracking: FactStream; // Service -> Web
  // Feed delle notifiche
  readonly notifications: NotifyFeed; // Service -> Web
  // Feed di activity tracing (cosa fa l'entità in un dato momento)
  readonly activity: ActivityFeed; // Service -> Web
  // Feed delle transizioni di stato del motore di recovery
  readonly recovery: RecoveryFeed; // Service -> Web
  // Heartbeat dei loop di background (vedi packages/ui/src/task-runner)
  readonly loops: LoopFeed; // Service -> Web
}
