// Un predicato è un fatto nominato su un'entità di un dominio monitorato (es. "questa camera
// Suitest sta streammando"). Il valore è tipizzato, non solo booleano, per rappresentare
// anche stati a più valori (es. lo status enum di un device) senza derivare N booleani distinti.

export type PredicateValue = boolean | string | number;

// Domini tracciati noti - domain resta string (non union) sul modello/codec per non rendere
// la validazione rigida su domini futuri; questa lista serve solo alla UI (select) per
// vincolare l'input ai valori noti oggi.
export const TRACKED_DOMAINS = ["adb", "suitest-camera", "suitest-control-unit", "suitest-device"] as const;
export type TrackedDomain = (typeof TRACKED_DOMAINS)[number];

export interface PredicateFact {
  readonly domain: string; // es. "adb" | "suitest-camera" | "suitest-control-unit" | "suitest-device"
  readonly entityId: string; // chiave dell'entità all'interno del proprio dominio
  readonly name: string; // nome del predicato, es. "suitest_camera_connected"
  readonly value: PredicateValue;
}

// Un fatto arricchito con i metadati assegnati dal feed al momento dell'emissione
export interface PredicateEntry extends PredicateFact {
  readonly id: number;
  readonly timestamp: number;
}

export const factKey = (fact: Pick<PredicateFact, "domain" | "entityId" | "name">): string =>
  `${fact.domain}:${fact.entityId}:${fact.name}`;
