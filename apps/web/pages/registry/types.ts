import type { InUseBy } from "@supervisor/core/adapters/suitest";
import type { AdbEntry, CameraEntry, CandyboxEntry, Database, TvEntry } from "@supervisor/core/db";

export type { AdbEntry, Database };

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
