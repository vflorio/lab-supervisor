// I fatti che l'anagrafica pubblica. Nomi al passato: sono cose successe, mai decisioni.
// Chi reagisce (recovery aborta una sessione quando arriva un `MaintenanceHoldPlaced`) lo
// decide altrove: un evento che dicesse "abortisci" starebbe decidendo al posto del core.

import type { DomainEvent } from "@lab/kernel";
import type { Custody } from "./Custody";
import type { DeviceId } from "./DeviceId";
import type { DeviceKind } from "./DeviceKind";
import type { Relation } from "./Relation";

export type DeviceRegistered = DomainEvent<"DeviceRegistered", { deviceId: DeviceId; kind: DeviceKind }>;

export type DeviceRetired = DomainEvent<"DeviceRetired", { deviceId: DeviceId }>;

export type DeviceAttached = DomainEvent<
  "DeviceAttached",
  { deviceId: DeviceId; parent: DeviceId; relation: Relation }
>;

export type MaintenanceHoldPlaced = DomainEvent<"MaintenanceHoldPlaced", { deviceId: DeviceId; reason: string }>;

export type MaintenanceHoldLifted = DomainEvent<"MaintenanceHoldLifted", { deviceId: DeviceId }>;

export type CustodyGranted = DomainEvent<"CustodyGranted", { deviceId: DeviceId; custody: Custody }>;

export type CustodyReleased = DomainEvent<"CustodyReleased", { deviceId: DeviceId }>;

export type DeviceEvent =
  | DeviceRegistered
  | DeviceRetired
  | DeviceAttached
  | MaintenanceHoldPlaced
  | MaintenanceHoldLifted
  | CustodyGranted
  | CustodyReleased;
