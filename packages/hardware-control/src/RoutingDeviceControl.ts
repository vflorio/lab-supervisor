// Lo smistamento (A-7): esiste una sola `DeviceControlPort`, definita per intento, e questo adapter
// decide chi la attua. Se esistessero un `SuitestPort` e un `AdbPort` separati, il dominio dovrebbe
// sapere quale usare — cioè saprebbe di adb, cioè sarebbe morto (NO-9).
// Smista su `(kind, remedy)` e non sul solo `DeviceKind`, ed è una scelta che costa nulla adesso e
// molto dopo (A-Ext-2): domani la TV avrà rimedi Suitest (power, reboot) **e** rimedi CDP, quindi il
// kind da solo non basterà più a scegliere.
// Ha bisogno del kind, che la porta non porta con sé: lo chiede all'anagrafica, come ogni altro
// adapter di questo package.

import type { Remedy } from "@lab/recovery/domain/Remedy";
import * as RemedyOutcome from "@lab/recovery/domain/RemedyOutcome";
import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import type { DeviceLookup } from "./DeviceLookup";

// `none` non è un crash: è `Unsupported`, cioè un esito che la sessione sa registrare nel dossier e
// su cui si arrende subito invece di ritentare a vuoto (FL-2, S9).
export type Route = (kind: DeviceKind, remedy: Remedy) => O.Option<DeviceControlPort>;

// La tabella del lab di oggi: le camere via adb (FATTO-11), CU e TV via Suitest (FATTO-10). Che poi
// Suitest sappia attuare solo il reboot di una CU è affar suo — risponde `Unsupported` a tutto il
// resto, ed è la risposta giusta finché lo smart plug non arriva (FATTO-5, NF-3). Instradare verso
// un adapter che dice di no vale più che non instradare affatto: la ragione finisce nel dossier.
// Sta qui come costruttore e non come costante perché le porte concrete le monta il composition root.
export const byKind = (adb: DeviceControlPort, suitest: DeviceControlPort): Route => {
  const table: Record<DeviceKind, DeviceControlPort> = {
    AndroidCamera: adb,
    ControlUnit: suitest,
    Tv: suitest,
  };
  return (kind) => O.some(table[kind]);
};

export const make = (route: Route, lookup: DeviceLookup): DeviceControlPort => ({
  apply: (deviceId, remedy) =>
    pipe(
      lookup(deviceId),
      TE.flatMap(
        O.match(
          () =>
            TE.right<never, RemedyOutcome.RemedyOutcome>(
              RemedyOutcome.rejected(`device ${deviceId} non presente in anagrafica`),
            ),
          (device) =>
            pipe(
              route(device.kind, remedy),
              O.match(
                () => TE.right<never, RemedyOutcome.RemedyOutcome>(RemedyOutcome.unsupported),
                (port) => port.apply(deviceId, remedy),
              ),
            ),
        ),
      ),
    ),
});
