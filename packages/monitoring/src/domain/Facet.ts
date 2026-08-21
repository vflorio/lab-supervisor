// Una faccia osservabile di un device. Sostituisce e assorbe l'idea di "che sonda uso": il
// dominio dichiara *quale faccia osserva*, l'adapter sceglie il protocollo (TCP, HTTP,
// `adb devices`, un campo Suitest). Un `ProbeSpec` separato sarebbe lo stesso concetto con due
// nomi.
// Una camera ha due facce indipendenti (FATTO-8) e cadono separatamente: il transport adb può
// restare incastrato con lo stream ancora attivo, o lo stream morire con adb vivissimo. Quella
// che interessa al business è lo stream; l'altra serve a scegliere il rimedio.
// Domani si aggiungerà `ContainerAlive` per la TV (FL-4), e nient'altro cambierà.

import type { DeviceKind } from "@lab/registry/domain/DeviceKind";

export type Facet = "Reachable" | "AdbTransport" | "StreamAvailable";

const byKind: Record<DeviceKind, ReadonlyArray<Facet>> = {
  ControlUnit: ["Reachable"],
  Tv: ["Reachable"],
  AndroidCamera: ["AdbTransport", "StreamAvailable"],
};

// La sola tabella che dice cosa si sonda per ciascun tipo: la usa lo scheduler delle sonde per
// sapere cosa chiedere e l'`Incident` per sapere di cosa fotografare lo stato. Vive qui e non
// nel registry perché `Facet` è published language del monitoring.
export const facetsOf = (kind: DeviceKind): ReadonlyArray<Facet> => byKind[kind];
