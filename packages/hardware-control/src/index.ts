// ACL verso l'hardware. Dipende da `recovery` e da `monitoring`, mai il contrario: le porte le
// definisce il consumatore, le implementano gli adapter (M-8, A-1).
// Espone i costruttori degli adapter e i tipi di configurazione, e nient'altro: i codec Suitest, il
// client adb e il mirror stanno in `internal/` perché sono vocabolario straniero, e il momento in
// cui qualcuno li importa da fuori è il momento in cui l'ACL ha smesso di essere un confine.

export * as AdbDeviceControl from "./AdbDeviceControl";
export * as AdbHealthProbe from "./AdbHealthProbe";
export type { DeviceLookup } from "./DeviceLookup";
export * as RoutingDeviceControl from "./RoutingDeviceControl";
export * as RoutingHealthProbe from "./RoutingHealthProbe";
export * as SuitestDeviceControl from "./SuitestDeviceControl";
export * as SuitestHealthProbe from "./SuitestHealthProbe";
