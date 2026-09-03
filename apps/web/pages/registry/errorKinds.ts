import { adbBridgeActivityTone, isRecoveryStuck } from "@supervisor/ui/registry/index";
import type { CameraRowData, ControlUnitRowData, TvRowData } from "./rowData";

// Etichette del filtro "In stato di errore": non esiste un unico stato d'errore nel dominio,
// ognuna qui riusa un predicato/tono già centralizzato altrove (RecoveryActivityView,
// AdbBridgeActivityView) invece di reinterpretare i campi grezzi.

export function controlUnitErrorKinds(data: ControlUnitRowData): readonly string[] {
  return [
    data.online === false && "Control unit offline",
    isRecoveryStuck(data.recoveryStatus) && "Recovery bloccata",
  ].filter((kind): kind is string => kind !== false);
}

export function tvErrorKinds(data: TvRowData): readonly string[] {
  return [
    data.deviceStatus === "OFFLINE" && "TV offline",
    isRecoveryStuck(data.recoveryStatus) && "Recovery bloccata",
  ].filter((kind): kind is string => kind !== false);
}

export function cameraErrorKinds(data: CameraRowData): readonly string[] {
  return [
    data.connected === false && "Camera non connessa",
    data.adbReachable === false && "Camera non raggiungibile (ADB)",
    data.agentProvisioned === false && "Agent non provisionato",
    adbBridgeActivityTone(data.adbActivityStatus)[0] === "error" && "ADB disconnesso",
    isRecoveryStuck(data.recoveryStatus) && "Recovery bloccata",
  ].filter((kind): kind is string => kind !== false);
}

// Opzioni del filtro "In stato di errore" nel toolbar - stesso principio delle "Level" chip di
// LogFiltersPanel: un vocabolario fisso, non ristretto a ciò che è presente in questo momento.
export const ERROR_KIND_OPTIONS = [
  "Control unit offline",
  "TV offline",
  "Camera non connessa",
  "Camera non raggiungibile (ADB)",
  "Agent non provisionato",
  "ADB disconnesso",
  "Recovery bloccata",
] as const;
