// Tipi di confine della UI: forme piatte e serializzabili che rispecchiano i modelli del
// servizio (@supervisor/core), senza le loro dipendenze da validazione runtime (io-ts,
// Option-wrapped FK). Ogni componente in packages/ui/src/registry importa solo da qui: il
// wiring reale (layer C) sostituirà questo file con gli import veri, e tutto il resto compila
// senza modifiche. LoopState/ServiceConnection non sono qui: appartengono già a
// packages/ui/src/task-runner/types.ts, che questo modulo non deve duplicare.

export type ActivitySource = "recovery" | "adb" | "workflow" | "manual-workflow";

// "Cosa sta facendo un sottosistema per questa entità adesso", una riga per (source, entityId).
export interface ActivityEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly entityId: string;
  readonly source: ActivitySource;
  // Riga leggibile, es. "pending", "running", "connected"
  readonly status: string;
}

export const activityKey = (entry: Pick<ActivityEntry, "source" | "entityId">): string =>
  `${entry.source}:${entry.entityId}`;

// Il valore di un predicato è tipizzato, non solo booleano, per rappresentare anche stati a più
// valori (es. lo status enum di un device) senza derivare N booleani distinti.
export type PredicateValue = boolean | string | number;

export const TRACKED_DOMAINS = ["adb", "suitest-camera", "suitest-control-unit", "suitest-device"] as const;
export type TrackedDomain = (typeof TRACKED_DOMAINS)[number];

// Un fatto nominato su un'entità di un dominio monitorato.
export interface PredicateFact {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
  readonly value: PredicateValue;
}

export interface PredicateEntry extends PredicateFact {
  readonly id: number;
  readonly timestamp: number;
}

// Host = target la cui porta non è ancora nota; Endpoint = target ADB completo.
export interface Host {
  readonly ip: string;
}

export interface Endpoint {
  readonly ip: string;
  readonly port: number;
}

export const formatEndpoint = (target: Endpoint): string => `${target.ip}:${target.port}`;

// Ciclo di vita della connessione ADB di una camera Android: una istanza per camera controlled.
export type AndroidBridgeState =
  | { readonly _tag: "Connecting"; readonly id: string; readonly host: Host }
  | { readonly _tag: "Idle"; readonly id: string; readonly target: Endpoint }
  | { readonly _tag: "Disconnecting"; readonly id: string; readonly host: Host }
  | { readonly _tag: "Disconnected"; readonly id: string; readonly host: Host; readonly reason: string };

// Solo Idle ha una connessione utilizzabile e accetta comandi verso il device.
export const acceptsCommands = (state: AndroidBridgeState): boolean => state._tag === "Idle";

export type DurationString = `${number}${"ms" | "s" | "m" | "h"}`;

// Control unit (CandyBox): identità = id Suitest, non esiste indipendentemente da Suitest.
export interface ControlUnitEntry {
  readonly id: string;
  readonly label: string;
  readonly controlled: boolean;
}

// TV: identità = deviceId Suitest; `ip` è un dato secondario, può mancare.
export interface TvEntry {
  readonly deviceId: string;
  readonly label: string;
  readonly controlled: boolean;
  readonly ip?: string;
}

// Camera (device Android su ADB): identità locale stabile, perché una camera Suitest non ha IP e
// l'host ADB associato può essere riassegnato. Le due FK sono opzionali: una camera aggiunta a
// mano (es. un tablet) può non averle.
export interface CameraEntry {
  readonly id: string;
  readonly label: string;
  readonly controlled: boolean;
  readonly videoCaptureDeviceId?: string;
  readonly adbId?: string;
}

// Target ADB registrato manualmente: `id` coincide con la forma stringa del target.
export interface AdbEntry {
  readonly id: string;
  readonly label: string;
  readonly target: Endpoint;
}
