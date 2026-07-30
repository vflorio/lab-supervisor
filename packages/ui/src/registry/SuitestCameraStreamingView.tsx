import { IndicatorStat } from "./IndicatorStat";
import type { StatusTone } from "./StatusPill";

export interface SuitestCameraStreamingViewProps {
  readonly value?: boolean;
}

// suitest-camera.suitest_camera_streaming - "active" è "info" (in corso, non pericoloso come
// una registrazione), a differenza di suitest_camera_recording.
export function SuitestCameraStreamingView({ value }: SuitestCameraStreamingViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined ? ["disabled", "unknown"] : value ? ["info", "active"] : ["disabled", "idle"];

  return <IndicatorStat label="STREAM" value={text} tone={tone} />;
}
