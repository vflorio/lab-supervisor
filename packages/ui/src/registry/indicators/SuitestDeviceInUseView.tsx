import { IndicatorStat } from "../IndicatorStat";
import type { StatusTone } from "../StatusPill";

export interface SuitestDeviceInUseViewProps {
  readonly value?: boolean;
  // Email / nome org / nome token di chi tiene il device occupato, se noto.
  readonly by?: string;
}

// suitest-device.suitest_device_in_use - true è "warning" (occupato, non un errore), false è
// "disabled" (disponibile è lo stato di riposo, non uno stato positivo da evidenziare).
export function SuitestDeviceInUseView({ value, by }: SuitestDeviceInUseViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined
      ? ["disabled", "unknown"]
      : value
        ? ["warning", by ? `in use by ${by}` : "in use"]
        : ["disabled", "available"];

  return <IndicatorStat label="IN USE" value={text} tone={tone} />;
}
