// ACL verso la Private API di Suitest: è il solo canale con cui si comandano CU e TV (FATTO-10).
// In questo giro esiste solo la firma (NO-14).
// Travaso: il client sta già in `legacy/core/src/adapters/suitest.ts` e funziona — non va
// reimplementato, va avvolto. `legacy/core/src/suitest-store/**` è la fonte dei fatti §1 su
// `online`, `status` e `streamActive`.
// Il suo mestiere è tradurre **tutto** in `RemedyOutcome` (A-6): un 4xx diventa `Rejected`, un
// timeout `Unreachable`, un comando che quell'unità non espone `Unsupported`. Se un `AxiosError`
// attraversa la porta, l'ACL ha perso (NO-10).

import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";

export type SuitestConfig = {
  readonly baseUrl: string;
  readonly token: string;
};

// Attua `PowerOn` e `RebootHardware`. Ogni altro rimedio è fuori dal suo mandato e torna
// `Unsupported`: non è questo adapter a sapere chi altro potrebbe farcela, è il routing.
export declare const make: (config: SuitestConfig) => DeviceControlPort;
