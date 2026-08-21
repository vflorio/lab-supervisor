// La sonda del transport adb (M-3). In questo giro solo la firma (NO-14).
// `AdbTransport` è la faccia che risponde alla domanda "l'host `host:porta` risponde, o
// `adb devices` lo riporta connesso?" (FATTO-8). È indipendente dallo stream, e cade
// separatamente: un transport incastrato con lo stream ancora attivo è il caso normale, non
// l'eccezione, ed è la ragione per cui le due facce sono due.
// Travaso: `legacy/core/src/adapters/adb/target-resolution.ts` e `avahi-browse.ts` (mDNS, che a
// volte non rileva un device tornato online — FATTO-12).

import type { HealthProbePort } from "@lab/monitoring/ports/HealthProbePort";
import type { AdbConfig } from "./AdbDeviceControl";

export declare const make: (config: AdbConfig) => HealthProbePort;
