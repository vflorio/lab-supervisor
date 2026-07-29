import type { ControlUnit, Device, VideoCaptureDevice } from "../adapters/suitest";
import type { SuitestStore } from "./model";

const byId = <T>(items: readonly T[], id: (item: T) => string): Record<string, T> =>
  Object.fromEntries(items.map((item) => [id(item), item]));

export interface SuitestLists {
  readonly devices: readonly Device[];
  readonly controlUnits: readonly ControlUnit[];
  readonly videoCaptureDevices: readonly VideoCaptureDevice[];
}

// Il mirror è una sostituzione integrale ad ogni sync: non c'è stato locale da preservare qui
// (quello vive nel dominio applicativo, lab-registry), quindi non serve merge.
export const replaceFromSuitest = (lists: SuitestLists): SuitestStore => ({
  devices: byId(lists.devices, (d) => d.deviceId),
  controlUnits: byId(lists.controlUnits, (cu) => cu.id),
  videoCaptureDevices: byId(lists.videoCaptureDevices, (v) => v.id),
});
