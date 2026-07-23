import * as Errors from "@supervisor/core/errors";
import * as IntervalLoop from "@supervisor/core/interval-loop";
import type * as Logger from "@supervisor/core/logger";
import * as NetworkTarget from "@supervisor/core/network-target";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import * as Adb from "@supervisor/core/services/adb";
import * as E from "fp-ts/Either";

// -------------------------------------------------------------------------------------
// ADB reachability tracker - dominio "adb":
// raggiungibilità dei device Android via rete locale
// (poll economico, nessun costo esterno, cadenza rapida).
//
// A differenza degli altri 3 domini, questo tracker non usa Predicates.run direttamente:
// espone anche un DeviceFeed "grezzo" (target+status, non solo il predicato booleano)
// consumato dalla subscription tRPC `android.devicesTail`
// -------------------------------------------------------------------------------------

export const DOMAIN = "adb";

const keyOf = (device: Adb.Device): string => NetworkTarget.format(device.target);

const toFacts = (device: Adb.Device): Readonly<Record<string, Predicates.PredicateValue>> => ({
  adb_device_reachable: device.status === "device",
});

export interface DeviceFeed {
  readonly subscribe: (listener: (devices: readonly Adb.Device[]) => void) => () => void;
  readonly snapshot: () => readonly Adb.Device[];
}

interface DeviceStream extends DeviceFeed {
  readonly publish: (devices: readonly Adb.Device[]) => void;
}

const createDeviceStream = (): DeviceStream => {
  let latest: readonly Adb.Device[] = [];
  const listeners = new Set<(devices: readonly Adb.Device[]) => void>();

  return {
    publish: (devices) => {
      latest = devices;
      for (const listener of listeners) listener(devices);
    },
    snapshot: () => latest,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export interface AdbTracker {
  readonly deviceFeed: DeviceFeed;
  readonly handle: IntervalLoop.Handle;
}

export const start = (
  log: Logger.Tagged,
  stream: Predicates.PredicateStream,
  policy: Retry.Policy,
  env: Adb.AdbEnv,
): AdbTracker => {
  const deviceStream = createDeviceStream();
  const diffFor = Predicates.diff<Adb.Device>(DOMAIN, keyOf, toFacts);
  let snapshot: ReadonlyMap<string, Predicates.PredicateValue> = new Map();

  const tick = async (): Promise<void> => {
    const result = await Adb.devices(env)();

    if (E.isLeft(result)) {
      log.error(`[${DOMAIN}] tracker poll failed: ${Errors.format(result.left)}`)();
      return;
    }

    deviceStream.publish(result.right);

    const { changed, next } = diffFor(snapshot, result.right);
    snapshot = next;
    for (const fact of changed) stream.emit(fact);
  };

  return {
    deviceFeed: deviceStream,
    handle: IntervalLoop.create(log.child(DOMAIN), policy, tick),
  };
};
