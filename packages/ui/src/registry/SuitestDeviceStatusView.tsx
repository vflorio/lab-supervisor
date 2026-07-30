import { IndicatorStat } from "./IndicatorStat";
import type { StatusTone } from "./StatusPill";

export interface SuitestDeviceStatusViewProps {
  readonly value?: string;
}

// suitest-device.suitest_device_status - READY/OFFLINE hanno un tono dedicato, ogni altro
// valore (stato transitorio Suitest) è "warning": non è né pronto né offline.
export function SuitestDeviceStatusView({ value }: SuitestDeviceStatusViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined
      ? ["disabled", "unknown"]
      : value === "READY"
        ? ["success", "READY"]
        : value === "OFFLINE"
          ? ["error", "OFFLINE"]
          : ["warning", value];

  return <IndicatorStat label="STATUS" value={text} tone={tone} />;
}
