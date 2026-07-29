// Un predicato è un fatto nominato su un'entità di un dominio monitorato (es. "questa camera
// Suitest sta streammando"). Il valore è tipizzato, non solo booleano, per rappresentare
// anche stati a più valori (es. lo status enum di un device) senza derivare N booleani distinti.

export type PredicateValue = boolean | string | number;

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

// Chiave univoca di un fatto, usata per indicizzare lo snapshot "valore corrente"
export const factKey = (fact: Pick<PredicateFact, "domain" | "entityId" | "name">): string =>
  `${fact.domain}:${fact.entityId}:${fact.name}`;
