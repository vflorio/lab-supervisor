import { IndicatorStat } from "./IndicatorStat";
import type { StatusTone } from "./StatusPill";

export interface AdbDeviceReachableViewProps {
  readonly value?: boolean;
}

// adb.adb_device_reachable - raggiungibilità fisica dell'host ADB assegnato, distinta dallo
// stato Suitest della camera (vedi SuitestCameraConnectedView): le due possono divergere.
export function AdbDeviceReachableView({ value }: AdbDeviceReachableViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined ? ["disabled", "unknown"] : value ? ["success", "reachable"] : ["error", "unreachable"];

  return <IndicatorStat label="ADB" value={text} tone={tone} />;
}
