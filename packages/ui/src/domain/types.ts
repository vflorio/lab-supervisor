import type { CameraEntry as CoreCameraEntry } from "@supervisor/core/lab-registry/camera";
import type { CandyboxEntry } from "@supervisor/core/lab-registry/candybox";
import type { TvEntry as CoreTvEntry } from "@supervisor/core/lab-registry/tv";

// Control unit (CandyBox): identità = id Suitest, nessuna FK, forma identica a core.
export type ControlUnitEntry = CandyboxEntry;

// TV: identità = deviceId Suitest; `ip` è l'unica FK opzionale (Option<string> in core).
export type TvEntry = Omit<CoreTvEntry, "ip"> & { readonly ip?: string };

// Camera (device Android su ADB): `videoCaptureDeviceId`/`adbId` sono le due FK opzionali
// (Option<string> in core) verso suitest-store e lab.adb rispettivamente.
export type CameraEntry = Omit<CoreCameraEntry, "videoCaptureDeviceId" | "adbId"> & {
  readonly videoCaptureDeviceId?: string;
  readonly adbId?: string;
};
