// Su cosa si apre una sessione. Due forme sole, e la seconda è la ragione per cui FL-3 esiste:
// quando i figli di una ControlUnit cadono insieme, il guasto è uno, non cinque (FATTO-4), e
// il bersaglio su cui si *agisce* è la CU mentre i membri coinvolti sono anche i suoi figli.
// `members` è ciò che INV-1 confronta (una sola sessione attiva per device coinvolto, non per
// bersaglio); `actsOn` è ciò a cui si manda il comando.

import type { DeviceId } from "@lab/registry/domain/DeviceId";
import * as DeviceIds from "@lab/registry/domain/DeviceId";
import { pipe } from "fp-ts/function";
import * as RA from "fp-ts/ReadonlyArray";
import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";

export type RecoveryTarget =
  | { readonly _tag: "Device"; readonly deviceId: DeviceId }
  | {
      readonly _tag: "ControlUnitCluster";
      readonly unitId: DeviceId;
      readonly dependents: ReadonlyNonEmptyArray<DeviceId>;
    };

export const device = (deviceId: DeviceId): RecoveryTarget => ({ _tag: "Device", deviceId });

export const controlUnitCluster = (unitId: DeviceId, dependents: ReadonlyNonEmptyArray<DeviceId>): RecoveryTarget => ({
  _tag: "ControlUnitCluster",
  unitId,
  dependents: pipe(dependents, RA.sort(DeviceIds.Ord)) as ReadonlyNonEmptyArray<DeviceId>,
});

// Tutti i device che la sessione tiene occupati. Per un cluster sono la CU **e** i suoi
// dipendenti: è esattamente il conto che impedisce a una TV di avere una sessione propria
// mentre il cluster che la contiene ne ha già una (INV-1).
export const members = (target: RecoveryTarget): ReadonlySet<DeviceId> =>
  target._tag === "Device" ? new Set([target.deviceId]) : new Set([target.unitId, ...target.dependents]);

// Il device a cui si manda il comando. Per un cluster è la CU: riavviare una TV non ripara mai
// il ponte che la pilota.
export const actsOn = (target: RecoveryTarget): DeviceId =>
  target._tag === "Device" ? target.deviceId : target.unitId;

export const key = (target: RecoveryTarget): string =>
  target._tag === "Device" ? `device:${target.deviceId}` : `cluster:${target.unitId}`;

export const involves = (target: RecoveryTarget, deviceId: DeviceId): boolean => members(target).has(deviceId);
