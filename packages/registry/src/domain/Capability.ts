// Cosa un device *sa* fare. Ha due letture, e tenerle distinte è ciò che evita di scoprire al
// dispaccio un errore che si poteva vedere alla nascita:
//  - `capabilitiesOfKind` è il soprainsieme di ciò che quel tipo di device può *mai* fare, e
//    serve a `SupervisionProfile.make` per rifiutare un playbook assurdo (chiedere `AdbTcp` a
//    una TV) prima ancora che esista una sessione;
//  - `Device.capabilities` è ciò che *quella istanza* dichiara davvero (FATTO-1: non tutte le
//    CU si riavviano), e il controllo avviene al dispaccio restituendo `Unsupported` (FL-2).
// Nessuna capability riguarda gli smart plug: fuori scope in questo giro (NF-3).

import type { DeviceKind } from "./DeviceKind";

export type Capability = "PowerOn" | "RebootHardware" | "AppControl" | "AdbTcp";

const byKind: Record<DeviceKind, ReadonlyArray<Capability>> = {
  // CU e TV si comandano solo attraverso la Private API di Suitest (FATTO-10).
  ControlUnit: ["PowerOn", "RebootHardware"],
  Tv: ["PowerOn", "RebootHardware"],
  // Una camera si comanda solo via adb (FATTO-11) e non ha accensione remota: è un telefono.
  AndroidCamera: ["AdbTcp", "AppControl", "RebootHardware"],
};

export const capabilitiesOfKind = (kind: DeviceKind): ReadonlySet<Capability> => new Set(byKind[kind]);

export const setOf = (...capabilities: ReadonlyArray<Capability>): ReadonlySet<Capability> => new Set(capabilities);

export const isSupportedBy = (capability: Capability, capabilities: ReadonlySet<Capability>): boolean =>
  capabilities.has(capability);
