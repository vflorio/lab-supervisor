import { useEffect, useState } from "react";
import { trpc } from "../trpc/client";

export interface AdbDevice {
  target: string;
  status: string;
}

// Live tail dello stato ADB degli host (raggiungibilità fisica del device via `adb devices`).
// `initial` viene usato per il primo render (dato SSR) finché la subscription non si connette.
export function useAdbDevices(initial: readonly AdbDevice[] = []): readonly AdbDevice[] {
  const [devices, setDevices] = useState<readonly AdbDevice[]>(initial);

  useEffect(() => {
    const subscription = trpc.android.devicesTail.subscribe(undefined, {
      onData: (snapshot) => setDevices(snapshot),
    });

    return () => subscription.unsubscribe();
  }, []);

  return devices;
}
