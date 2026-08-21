// L'arco verso il genitore, e le sole forme che il lab ammette (INV-12).
// La regola di forma sta qui perché è una proprietà dell'arco, non del device: il conteggio
// dei figli invece non è verificabile guardando un solo arco e vive nel caso d'uso (INV-12).

import type { DeviceId } from "./DeviceId";
import type { DeviceKind } from "./DeviceKind";
import type { Relation } from "./Relation";

export type Attachment = {
  readonly parent: DeviceId;
  readonly relation: Relation;
};

export const make = (parent: DeviceId, relation: Relation): Attachment => ({ parent, relation });

// Numero massimo di figli `DependsOn` di una ControlUnit: è un limite fisico di porte
// (FATTO-2), non una configurazione.
export const maxDependentsPerControlUnit = 4;

// Una TV dipende da una CU; una camera inquadra una TV; una CU non ha genitore.
// Ogni altra combinazione è una topologia impossibile, non una topologia insolita.
export const isValidPair = (childKind: DeviceKind, parentKind: DeviceKind, relation: Relation): boolean => {
  if (childKind === "Tv") return parentKind === "ControlUnit" && relation === "DependsOn";
  if (childKind === "AndroidCamera") return parentKind === "Tv" && relation === "Observes";
  return false;
};
