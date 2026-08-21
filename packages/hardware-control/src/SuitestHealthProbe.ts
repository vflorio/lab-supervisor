// Le sonde che leggono Suitest, una per faccia (M-3). In questo giro solo la firma (NO-14).
// `Reachable` per una CU è il campo `online` per unità (FATTO-6); per una TV è lo `status` del
// device (FATTO-7). `StreamAvailable` per una camera è `streamActive` (e `online`) del
// video-capture-device associato (FATTO-8).
// Travaso: `legacy/core/src/adapters/suitest.ts` e `suitest-store/sync.ts`.
// Traduce tutto in `ProbeOutcome`: una sonda che fallisce ha appena fatto il suo lavoro, e il
// canale d'errore della porta è `never` (A-6).

import type { HealthProbePort } from "@lab/monitoring/ports/HealthProbePort";
import type { SuitestConfig } from "./SuitestDeviceControl";

export declare const make: (config: SuitestConfig) => HealthProbePort;
