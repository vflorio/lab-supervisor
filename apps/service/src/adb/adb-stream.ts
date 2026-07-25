import type * as Adb from "@supervisor/core/services/adb";

export interface AdbDeviceFeed {
  readonly subscribe: (listener: (devices: readonly Adb.Device[]) => void) => () => void;
  readonly snapshot: () => readonly Adb.Device[];
}

export interface AdbDeviceStream extends AdbDeviceFeed {
  readonly publish: (devices: readonly Adb.Device[]) => void;
}

export const createAdbDeviceStream = (): AdbDeviceStream => {
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
