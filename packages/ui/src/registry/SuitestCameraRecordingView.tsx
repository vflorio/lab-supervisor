import { IndicatorStat } from "./IndicatorStat";
import type { StatusTone } from "./StatusPill";

export interface SuitestCameraRecordingViewProps {
  readonly value?: boolean;
}

// suitest-camera.suitest_camera_recording - "active" è "error" non perché sia un guasto, ma
// perché registrare consuma la camera: un operatore deve accorgersene a colpo d'occhio.
export function SuitestCameraRecordingView({ value }: SuitestCameraRecordingViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined ? ["disabled", "unknown"] : value ? ["error", "active"] : ["disabled", "idle"];

  return <IndicatorStat label="REC" value={text} tone={tone} />;
}
