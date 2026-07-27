import type * as TE from "fp-ts/TaskEither";
import type { ActivityFeed } from "./activity/stream";
import type * as Adb from "./adapters/adb/shell";
import type * as ConfigModel from "./config";
import type * as Db from "./db";
import type { LogFeed } from "./logger/log-stream";
import type * as Logger from "./logger/logger";
import type * as Network from "./network";
import type { NotifyFeed } from "./notify/stream";
import type { PredicateFeed } from "./predicates/feed";
import type { RecoveryFeed } from "./recovery/status";

// Funzionalità espone su tRPC

export interface AndroidDeviceSnapshot {
  readonly target: string;
  readonly status: string;
}

interface AndroidBridge {
  readonly devices: () => TE.TaskEither<Adb.Error, readonly AndroidDeviceSnapshot[]>;
  readonly reboot: (target: Network.Endpoint) => TE.TaskEither<Adb.Error, void>;
  // Feed alimentato dal tracker ADB
  readonly devicesFeed: {
    readonly subscribe: (listener: (devices: readonly AndroidDeviceSnapshot[]) => void) => () => void;
    readonly snapshot: () => readonly AndroidDeviceSnapshot[];
  };
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
}

export interface Services {
  readonly android: AndroidBridge;
  readonly registry: DeviceRegistry;
  readonly settings: Settings;
  // Questo serve per permettere di avere in logger transportato in HTTP (per loggare errori critici delle web-app)
  readonly logger: Logger.Tagged; // Web -> Service

  // Riarma il tripwire di un'entità dopo un esaurimento dei retry (intervento manuale) -
  // `false` se il servizio non è "active" (nessun motore di recovery in esecuzione) o se
  // l'entità/tripwire indicati non sono mai stati osservati. Web -> Service
  readonly recoveryReset: (policyLabel: string, entityId: string, tripwireIndex: number) => boolean;

  // tRPC Feeds

  // Feed dei log di servizio
  readonly logs: LogFeed; // Service -> Web
  // Feed dei predicati di tracking
  readonly tracking: PredicateFeed; // Service -> Web
  // Feed delle notifiche
  readonly notifications: NotifyFeed; // Service -> Web
  // Feed di activity tracing (cosa fa l'entità in un dato momento)
  readonly activity: ActivityFeed; // Service -> Web
  // Feed delle transizioni di stato del motore di recovery
  readonly recovery: RecoveryFeed; // Service -> Web
}
