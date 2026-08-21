// Lo smistamento (A-7): esiste una sola `DeviceControlPort`, definita per intento, e questo
// adapter decide chi la attua. Se esistessero un `SuitestPort` e un `AdbPort` separati, il dominio
// dovrebbe sapere quale usare — cioè saprebbe di adb, cioè sarebbe morto (NO-9).
// Smista su `(kind, remedy)` e non sul solo `DeviceKind`, ed è una scelta che costa nulla adesso e
// molto dopo (A-Ext-2): domani la TV avrà rimedi Suitest (power, reboot) **e** rimedi CDP, quindi
// il kind da solo non basterà più a scegliere. In questo giro è solo una firma (NO-14).

import type { Remedy } from "@lab/recovery/domain/Remedy";
import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";

export type Route = (kind: DeviceKind, remedy: Remedy) => DeviceControlPort;

// Riceve gli adapter concreti e la tabella di instradamento. Un `(kind, remedy)` senza rotta non è
// un crash: è `Unsupported`, cioè un esito che la sessione sa registrare nel dossier.
export declare const make: (route: Route) => DeviceControlPort;
