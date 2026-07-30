import { IndicatorStat } from "./IndicatorStat";
import type { StatusTone } from "./StatusPill";

export interface SuitestControlUnitOnlineViewProps {
  readonly value?: boolean;
}

// suitest-control-unit.suitest_control_unit_online - stessa forma binaria online/offline delle
// altre predicate view, isolata qui perché il dominio è distinto (control unit, non camera/TV).
export function SuitestControlUnitOnlineView({ value }: SuitestControlUnitOnlineViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined ? ["disabled", "unknown"] : value ? ["success", "online"] : ["error", "offline"];

  return <IndicatorStat label="ONLINE" value={text} tone={tone} />;
}
