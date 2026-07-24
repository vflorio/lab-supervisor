import type { AdbEntry, CameraEntry, CandyboxEntry, Db, TvEntry } from "@supervisor/core/services/db";
import type { InUseBy } from "@supervisor/core/services/suitest";
import type { AdbDevice } from "../../hooks/useAdbDevices";

export type { AdbEntry, Db };

export type DeviceKind = "candybox" | "camera" | "tv";

export interface ControlUnitView extends CandyboxEntry {
  online?: boolean;
}

export interface CameraView extends CameraEntry {
  suitest?: {
    customName?: string;
    assignedDeviceId?: string;
    online: boolean;
    recordingActive: boolean;
    streamActive: boolean;
  };
  // Risolto da `adbId` tramite `db.lab.adb` - vedi hierarchy.ts
  adb?: AdbEntry;
}

export interface TvView extends TvEntry {
  controlUnitIds?: string[];
  inUseBy?: InUseBy;
}

export interface TvGroup {
  tv: TvView;
  cameras: CameraView[];
}

export interface CuGroup {
  cu: ControlUnitView;
  tvs: TvGroup[];
}

export interface Hierarchy {
  cuGroups: CuGroup[];
  unallocatedTvs: TvGroup[];
  orphanCameras: CameraView[];
}

// Candybox/Camera/TV derivano da config seed / Suitest sync: l'unico device registrabile
// manualmente dalla UI è un target ADB (es. un tablet), poi assegnabile a una camera.
export interface NewAdbTargetForm {
  label: string;
  target: string; // "ip:port", validato a runtime con Network.decode
}

// Riconciliazione manuale camera <-> video-capture-device Suitest
export interface LinkingTarget {
  id: string; // id camera
  currentVideoCaptureDeviceId?: string;
}

// Props condivise dalle righe della gerarchia (control unit / tv / camera)
export interface RowActions {
  adbDevices: readonly AdbDevice[];
  onToggle: (kind: DeviceKind, id: string, controlled: boolean) => void;
  onEdit: (kind: DeviceKind, id: string, label: string) => void;
  onDelete: (kind: DeviceKind, id: string) => void;
  onAssignCamera: (camera: CameraView) => void;
  onLinkCamera: (camera: CameraView) => void;
}
