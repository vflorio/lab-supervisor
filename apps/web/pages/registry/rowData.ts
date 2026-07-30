import { activityKey } from "@supervisor/core/activity/model";
import * as Network from "@supervisor/core/network";
import { factKey } from "@supervisor/core/predicates/model";
import type {
  CameraEntry as DomainCameraEntry,
  ControlUnitEntry as DomainControlUnitEntry,
  TvEntry as DomainTvEntry,
} from "@supervisor/ui/domain/types";
import * as O from "fp-ts/Option";
import { useActivity } from "../../hooks/useActivity";
import { usePredicates } from "../../hooks/usePredicates";
import { useRecoveryIntervention } from "../../hooks/useRecovery";
import type { CameraView, ControlUnitView, TvView } from "./types";

// -------------------------------------------------------------------------------------
// Adatta le entità arricchite dal registry (hierarchy.ts) alle forme piatte richieste dai
// componenti puri di @supervisor/ui/registry, e risolve i valori live (predicati/activity/
// recovery) nelle prop già risolte che quei componenti si aspettano (vedi
// packages/ui/src/domain/types.ts: "il wiring reale sostituirà questo file con gli import veri").
// -------------------------------------------------------------------------------------

export const toControlUnitEntry = (cu: ControlUnitView): DomainControlUnitEntry => cu;

export const toTvEntry = (tv: TvView): DomainTvEntry => ({
  deviceId: tv.deviceId,
  label: tv.label,
  controlled: tv.controlled,
  ip: O.toUndefined(tv.ip),
});

export const toCameraEntry = (camera: CameraView): DomainCameraEntry => ({
  id: camera.id,
  label: camera.label,
  controlled: camera.controlled,
  videoCaptureDeviceId: O.toUndefined(camera.videoCaptureDeviceId),
  adbId: O.toUndefined(camera.adbId),
});

export type ResetRecovery = (policy: string, entityId: string, tripwireIndex: number) => void;

// I componenti puri espongono un solo `onResetRecovery` senza argomenti (un bottone per riga),
// quindi qui si prende il primo tripwire bloccato per (domain, entityId) - nel caso comune ce
// n'è al più uno alla volta.
function useResetRecoveryHandler(domain: string, entityId: string, onReset: ResetRecovery): (() => void) | undefined {
  const entry = useRecoveryIntervention(domain, entityId)[0];
  return entry ? () => onReset(entry.policy, entry.entityId, entry.tripwireIndex) : undefined;
}

export interface CameraRowData {
  readonly connected?: boolean;
  readonly recording?: boolean;
  readonly streaming?: boolean;
  readonly adbReachable?: boolean;
  readonly recoveryStatus?: string;
  readonly adbActivityStatus?: string;
  readonly onResetRecovery?: () => void;
}

export function useCameraRowData(camera: CameraView, onResetRecovery: ResetRecovery): CameraRowData {
  const { table: predicates } = usePredicates();
  const { table: activity } = useActivity();
  const videoCaptureDeviceId = O.toUndefined(camera.videoCaptureDeviceId) ?? "";
  const adbAddress = camera.adb ? Network.format(camera.adb.target) : "";

  return {
    connected: predicates.get(
      factKey({ domain: "suitest-camera", entityId: videoCaptureDeviceId, name: "suitest_camera_connected" }),
    )?.value as boolean | undefined,
    recording: predicates.get(
      factKey({ domain: "suitest-camera", entityId: videoCaptureDeviceId, name: "suitest_camera_recording" }),
    )?.value as boolean | undefined,
    streaming: predicates.get(
      factKey({ domain: "suitest-camera", entityId: videoCaptureDeviceId, name: "suitest_camera_streaming" }),
    )?.value as boolean | undefined,
    adbReachable: predicates.get(factKey({ domain: "adb", entityId: adbAddress, name: "adb_device_reachable" }))
      ?.value as boolean | undefined,
    recoveryStatus: activity.get(activityKey({ source: "recovery", entityId: videoCaptureDeviceId }))?.status,
    adbActivityStatus: activity.get(activityKey({ source: "adb", entityId: camera.id }))?.status,
    onResetRecovery: useResetRecoveryHandler("suitest-camera", videoCaptureDeviceId, onResetRecovery),
  };
}

export interface TvRowData {
  readonly deviceStatus?: string;
  readonly inUse?: boolean;
  readonly inUseBy?: string;
  readonly recoveryStatus?: string;
  readonly onResetRecovery?: () => void;
}

export function useTvRowData(tv: TvView, onResetRecovery: ResetRecovery): TvRowData {
  const { table: predicates } = usePredicates();
  const { table: activity } = useActivity();

  return {
    deviceStatus: predicates.get(
      factKey({ domain: "suitest-device", entityId: tv.deviceId, name: "suitest_device_status" }),
    )?.value as string | undefined,
    inUse: predicates.get(factKey({ domain: "suitest-device", entityId: tv.deviceId, name: "suitest_device_in_use" }))
      ?.value as boolean | undefined,
    inUseBy: tv.inUseBy?.email ?? tv.inUseBy?.orgName ?? tv.inUseBy?.tokenName,
    recoveryStatus: activity.get(activityKey({ source: "recovery", entityId: tv.deviceId }))?.status,
    onResetRecovery: useResetRecoveryHandler("suitest-device", tv.deviceId, onResetRecovery),
  };
}

export interface ControlUnitRowData {
  readonly online?: boolean;
  readonly recoveryStatus?: string;
  readonly onResetRecovery?: () => void;
}

export function useControlUnitRowData(cu: ControlUnitView, onResetRecovery: ResetRecovery): ControlUnitRowData {
  const { table: predicates } = usePredicates();
  const { table: activity } = useActivity();

  return {
    online: predicates.get(
      factKey({ domain: "suitest-control-unit", entityId: cu.id, name: "suitest_control_unit_online" }),
    )?.value as boolean | undefined,
    recoveryStatus: activity.get(activityKey({ source: "recovery", entityId: cu.id }))?.status,
    onResetRecovery: useResetRecoveryHandler("suitest-control-unit", cu.id, onResetRecovery),
  };
}
