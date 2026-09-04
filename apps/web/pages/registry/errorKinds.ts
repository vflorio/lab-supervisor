import { adbBridgeActivityTone, isRecoveryStuck } from "@supervisor/ui/registry/index";
import type { CameraRowData, ControlUnitRowData, TvRowData } from "./rowData";

// Etichette del filtro "In stato di errore": non esiste un unico stato d'errore nel dominio,
// ognuna qui riusa un predicato/tono già centralizzato altrove (RecoveryActivityView,
// AdbBridgeActivityView) invece di reinterpretare i campi grezzi.

export function controlUnitErrorKinds(data: ControlUnitRowData): readonly string[] {
  return [
    data.online === false && "Control unit offline",
    isRecoveryStuck(data.recoveryStatus) && "Recovery stuck",
  ].filter((kind): kind is string => kind !== false);
}

export function tvErrorKinds(data: TvRowData): readonly string[] {
  return [
    data.deviceStatus === "OFFLINE" && "TV offline",
    isRecoveryStuck(data.recoveryStatus) && "Recovery stuck",
  ].filter((kind): kind is string => kind !== false);
}

export function cameraErrorKinds(data: CameraRowData): readonly string[] {
  return [
    data.connected === false && "Camera offline",
    data.adbReachable === false && "Camera offline (ADB)",
    data.agentProvisioned === false && "Agent unprovisioned",
    adbBridgeActivityTone(data.adbActivityStatus)[0] === "error" && "ADB disconnected",
    isRecoveryStuck(data.recoveryStatus) && "Recovery stuck",
  ].filter((kind): kind is string => kind !== false);
}

// Opzioni del filtro "In stato di errore" nel toolbar - stesso principio delle "Level" chip di
// LogFiltersPanel: un vocabolario fisso, non ristretto a ciò che è presente in questo momento.
export const ERROR_KIND_OPTIONS = [
  "Control unit offline",
  "TV offline",
  "Camera offline",
  "Camera offline (ADB)",
  "Agent unprovisioned",
  "ADB disconnected",
  "Recovery stuck",
] as const;
