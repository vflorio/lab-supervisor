import { IndicatorStat } from "../IndicatorStat";
import type { StatusTone } from "../StatusPill";

export interface SuitestCameraConnectedViewProps {
  readonly value?: boolean;
}

// suitest-camera.suitest_camera_connected - riflette lo stato lato Suitest (video-capture-device
// online), distinto dalla raggiungibilità ADB fisica (vedi AdbDeviceReachableView).
export function SuitestCameraConnectedView({ value }: SuitestCameraConnectedViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined ? ["disabled", "unknown"] : value ? ["success", "online"] : ["error", "offline"];

  return <IndicatorStat label="CONN" value={text} tone={tone} />;
}
