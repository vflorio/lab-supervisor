// I rifiuti che l'anagrafica prevede: sono esiti di dominio, non guasti tecnici. Un guasto
// tecnico non arriva mai fin qui, lo traduce l'adapter prima di attraversare la porta (A-6).

import type { DeviceId } from "./DeviceId";
import type { DeviceKind } from "./DeviceKind";
import type { Relation } from "./Relation";

// INV-12: una topologia che il lab non può avere.
export type InvalidAttachment = {
  readonly _tag: "InvalidAttachment";
  readonly child: DeviceId;
  readonly childKind: DeviceKind;
  readonly parent: DeviceId;
  readonly parentKind: DeviceKind;
  readonly relation: Relation;
};

// INV-12: una CU pilota al massimo 4 TV, ed è un limite di porte fisiche (FATTO-2).
export type TooManyDependents = {
  readonly _tag: "TooManyDependents";
  readonly unitId: DeviceId;
  readonly limit: number;
};

// Il device è in mano a qualcun altro (maintenance hold o registrazione in corso).
export type CustodyDenied = {
  readonly _tag: "CustodyDenied";
  readonly deviceId: DeviceId;
};

// Solo una ControlUnit ha un `ControlUnitType`, e ne ha sempre uno.
export type UnitTypeMismatch = {
  readonly _tag: "UnitTypeMismatch";
  readonly deviceId: DeviceId;
  readonly kind: DeviceKind;
};

// Una istanza non può dichiarare una capability che il suo tipo non potrà mai avere.
export type UnsupportedCapability = {
  readonly _tag: "UnsupportedCapability";
  readonly deviceId: DeviceId;
  readonly kind: DeviceKind;
};

export type DeviceNotFound = {
  readonly _tag: "DeviceNotFound";
  readonly deviceId: DeviceId;
};

export type RegistryError =
  | InvalidAttachment
  | TooManyDependents
  | CustodyDenied
  | UnitTypeMismatch
  | UnsupportedCapability
  | DeviceNotFound;

export const invalidAttachment = (
  child: DeviceId,
  childKind: DeviceKind,
  parent: DeviceId,
  parentKind: DeviceKind,
  relation: Relation,
): InvalidAttachment => ({ _tag: "InvalidAttachment", child, childKind, parent, parentKind, relation });

export const tooManyDependents = (unitId: DeviceId, limit: number): TooManyDependents => ({
  _tag: "TooManyDependents",
  unitId,
  limit,
});

export const custodyDenied = (deviceId: DeviceId): CustodyDenied => ({ _tag: "CustodyDenied", deviceId });

export const unitTypeMismatch = (deviceId: DeviceId, kind: DeviceKind): UnitTypeMismatch => ({
  _tag: "UnitTypeMismatch",
  deviceId,
  kind,
});

export const unsupportedCapability = (deviceId: DeviceId, kind: DeviceKind): UnsupportedCapability => ({
  _tag: "UnsupportedCapability",
  deviceId,
  kind,
});

export const deviceNotFound = (deviceId: DeviceId): DeviceNotFound => ({ _tag: "DeviceNotFound", deviceId });
