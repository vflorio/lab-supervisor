import type * as TE from "fp-ts/TaskEither";
import type * as ConfigModel from "../config";
import type { LogFeed } from "../log-stream";
import type * as Logger from "../logger";
import type * as Network from "../network";
import type { PredicateFeed } from "../predicates/feed";
import type { RecoveryFeed } from "../recovery/status";
import type * as Adb from "./adb";
import type * as Db from "./db";

export interface AndroidBridgeError {
  readonly type: "AndroidBridgeError";
  readonly message: string;
}

export interface AndroidDeviceSnapshot {
  readonly target: string;
  readonly status: string;
}

export interface AndroidBridge {
  readonly devices: () => TE.TaskEither<Adb.Error, readonly AndroidDeviceSnapshot[]>;
  readonly reboot: (target: Network.Endpoint) => TE.TaskEither<Adb.Error, void>;
  // Feed live alimentato dal tracker ADB centralizzato (apps/service/src/tracking/adb),
  // usato dalla subscription tRPC `android.devicesTail` invece di ripollare `adb devices`
  // in autonomia (era una fonte di poll ridondante rispetto al tracker).
  readonly devicesFeed: {
    readonly subscribe: (listener: (devices: readonly AndroidDeviceSnapshot[]) => void) => () => void;
    readonly snapshot: () => readonly AndroidDeviceSnapshot[];
  };
}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface MdnsDiscovery {}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface Notifications {}

export interface DeviceRegistry {
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

export interface Settings {
  // Config già redatta (segreti mascherati) - non esporre mai la ServiceConfig raw fuori dal processo
  readonly getConfig: () => ConfigModel.Service;
}

export interface Services {
  readonly android: AndroidBridge;
  readonly mdns: MdnsDiscovery;
  readonly registry: DeviceRegistry;
  readonly settings: Settings;
  readonly notifications: Notifications;
  // Questo serve per permettere di avere in logger transportato in HTTP (per loggare errori critici delle web-app)
  readonly logger: Logger.Tagged; // Web -> Service
  // Feed live dei log di servizio (formattati come su console) per la subscription tRPC verso la web-app
  readonly logs: LogFeed; // Service -> Web
  // Feed live dei predicati di activation (packages/core/src/predicates) per la subscription tRPC verso la web-app
  readonly tracking: PredicateFeed; // Service -> Web
  // Feed live delle transizioni di stato del motore di recovery (packages/core/src/recovery/status)
  // per la subscription tRPC verso la web-app
  readonly recovery: RecoveryFeed; // Service -> Web
}
