// L'aggregato di anagrafica: cos'è un device, dove si raggiunge, chi lo ha in mano, se lo
// guardiamo. Non sa nulla di salute né di recupero — quelli sono altri contesti.
// Custodisce la parte di INV-12 che si vede da un solo arco (forme di attacco ammesse); il
// conteggio dei figli di una CU non è visibile da qui e vive in `AttachDevice`.

import { Decider, type Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as Attachment from "./Attachment";
import type { Capability } from "./Capability";
import { capabilitiesOfKind } from "./Capability";
import type { ControlUnitType } from "./ControlUnitType";
import * as Custody from "./Custody";
import type { DeviceEvent } from "./DeviceEvent";
import type { DeviceId } from "./DeviceId";
import type { DeviceKind } from "./DeviceKind";
import * as Endpoints from "./Endpoints";
import * as Errors from "./errors";
import type { Relation } from "./Relation";

export type Device = {
  readonly id: DeviceId;
  readonly kind: DeviceKind;
  readonly unitType: O.Option<ControlUnitType>;
  readonly attachment: O.Option<Attachment.Attachment>;
  readonly endpoints: Endpoints.Endpoints;
  readonly capabilities: ReadonlySet<Capability>;
  readonly custody: Custody.Custody;
  readonly monitored: boolean;
};

export type Draft = {
  readonly id: DeviceId;
  readonly kind: DeviceKind;
  readonly unitType?: O.Option<ControlUnitType>;
  readonly endpoints?: Endpoints.Endpoints;
  readonly capabilities?: ReadonlySet<Capability>;
  readonly monitored?: boolean;
};

// Un device nasce senza genitore e in custodia al supervisore: l'attacco è un'operazione a
// parte (`AttachDevice`) perché è l'unica che deve guardare il resto della topologia.
export const register = (
  draft: Draft,
  now: Instant,
): E.Either<Errors.UnitTypeMismatch | Errors.UnsupportedCapability, Decision<Device, DeviceEvent>> => {
  const unitType = draft.unitType ?? O.none;
  if (O.isSome(unitType) !== (draft.kind === "ControlUnit"))
    return E.left(Errors.unitTypeMismatch(draft.id, draft.kind));

  const capabilities = draft.capabilities ?? capabilitiesOfKind(draft.kind);
  const allowed = capabilitiesOfKind(draft.kind);
  if (![...capabilities].every((capability) => allowed.has(capability)))
    return E.left(Errors.unsupportedCapability(draft.id, draft.kind));

  const device: Device = {
    id: draft.id,
    kind: draft.kind,
    unitType,
    attachment: O.none,
    endpoints: draft.endpoints ?? Endpoints.empty,
    capabilities,
    custody: Custody.supervisor,
    monitored: draft.monitored ?? true,
  };
  return E.right(
    Decider.decision(device, [{ _tag: "DeviceRegistered", at: now, deviceId: device.id, kind: device.kind }]),
  );
};

// INV-12, la parte visibile da un solo arco: una TV dipende da una CU, una camera inquadra una
// TV, una CU non ha genitore. Il parametro è il genitore intero e non il suo id perché senza
// il suo `kind` la regola non è decidibile.
export const attach = (
  device: Device,
  parent: Device,
  relation: Relation,
  now: Instant,
): E.Either<Errors.InvalidAttachment, Decision<Device, DeviceEvent>> =>
  Attachment.isValidPair(device.kind, parent.kind, relation)
    ? E.right(
        Decider.decision({ ...device, attachment: O.some(Attachment.make(parent.id, relation)) }, [
          { _tag: "DeviceAttached", at: now, deviceId: device.id, parent: parent.id, relation },
        ]),
      )
    : E.left(Errors.invalidAttachment(device.id, device.kind, parent.id, parent.kind, relation));

// FATTO-15: uno spegnimento manuale non si scavalca mai. Metterlo è sempre lecito — anche
// sopra una registrazione in corso — perché è una persona davanti all'hardware, ed è
// l'autorità più alta che il modello conosca.
export const placeMaintenanceHold = (device: Device, reason: string, now: Instant): Decision<Device, DeviceEvent> =>
  Decider.decision({ ...device, custody: Custody.operator(reason, now) }, [
    { _tag: "MaintenanceHoldPlaced", at: now, deviceId: device.id, reason },
  ]);

export const liftMaintenanceHold = (device: Device, now: Instant): Decision<Device, DeviceEvent> =>
  Custody.isMaintenanceHold(device.custody)
    ? Decider.decision({ ...device, custody: Custody.supervisor }, [
        { _tag: "MaintenanceHoldLifted", at: now, deviceId: device.id },
      ])
    : Decider.unchanged(device);

// Concedere la custodia a un terzo è lecito solo se il supervisore ce l'ha: un maintenance
// hold non si scavalca nemmeno per registrare.
export const grantCustody = (
  device: Device,
  custody: Custody.Custody,
  now: Instant,
): E.Either<Errors.CustodyDenied, Decision<Device, DeviceEvent>> =>
  Custody.allowsSupervisor(device.custody, now)
    ? E.right(
        Decider.decision({ ...device, custody }, [{ _tag: "CustodyGranted", at: now, deviceId: device.id, custody }]),
      )
    : E.left(Errors.custodyDenied(device.id));

export const releaseCustody = (device: Device, now: Instant): Decision<Device, DeviceEvent> =>
  device.custody._tag === "Supervisor"
    ? Decider.unchanged(device)
    : Decider.decision({ ...device, custody: Custody.supervisor }, [
        { _tag: "CustodyReleased", at: now, deviceId: device.id },
      ]);

// Ritirare un device lo toglie dal monitoraggio: da qui in poi non se ne sonda più nessuna
// faccia, quindi non può più né aprire una sessione né entrare in una correlazione (INV-11).
export const retire = (device: Device, now: Instant): Decision<Device, DeviceEvent> =>
  Decider.decision({ ...device, monitored: false }, [{ _tag: "DeviceRetired", at: now, deviceId: device.id }]);

export const isSupervisable = (device: Device, now: Instant): boolean =>
  device.monitored && Custody.allowsSupervisor(device.custody, now);

export const can = (device: Device, capability: Capability): boolean => device.capabilities.has(capability);
