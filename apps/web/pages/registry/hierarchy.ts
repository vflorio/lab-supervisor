import * as Network from "@supervisor/core/network";
import * as O from "fp-ts/Option";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import type { CameraView, ControlUnitView, Database, Hierarchy, TvGroup, TvView } from "./types";

// Stato di raggiungibilità ADB dell'host assegnato alla camera (fisico, via `adb devices`) -
// distinto da `camera.suitest.online`, che riflette invece lo stato dell'app suitest-camera
export function adbStatusFor(
  adbDevices: readonly AdbDevice[],
  target: Network.Endpoint | undefined,
): AdbDevice["status"] | null {
  if (!target) return null;
  const formatted = Network.format(target);
  return adbDevices.find((d) => d.target === formatted)?.status ?? "disconnect";
}

// -------------------------------------------------------------------------------------
// Join lab <-> suitest (+ lab.adb) + Hierarchy - Control Unit -> TV -> Camera
// (non allocato/misto se manca il collegamento)
// -------------------------------------------------------------------------------------

function enrich(db: Database): { controlUnits: ControlUnitView[]; tvs: TvView[]; cameras: CameraView[] } {
  const controlUnits: ControlUnitView[] = Object.values(db.lab.candyboxes).map((cu) => ({
    ...cu,
    online: db.suitest.controlUnits[cu.id]?.online,
  }));

  // Identità TV = deviceId Suitest, sempre presente
  const tvs: TvView[] = Object.values(db.lab.tvs).map((tv) => {
    const device = db.suitest.devices[tv.deviceId];
    return { ...tv, controlUnitIds: device?.controlUnitIds, inUseBy: device?.inUseBy };
  });

  const cameras: CameraView[] = Object.values(db.lab.cameras).map((camera) => {
    const vcdId = O.toUndefined(camera.videoCaptureDeviceId);
    const vcd = vcdId ? db.suitest.videoCaptureDevices[vcdId] : undefined;
    const adbId = O.toUndefined(camera.adbId);
    const adb = adbId ? db.lab.adb[adbId] : undefined;
    return {
      ...camera,
      suitest: vcd
        ? {
            customName: vcd.customName,
            assignedDeviceId: vcd.assignedDeviceId,
            online: vcd.online,
            recordingActive: vcd.recordingActive,
            streamActive: vcd.streamActive,
          }
        : undefined,
      adb,
    };
  });

  return { controlUnits, tvs, cameras };
}

export function buildHierarchy(db: Database): Hierarchy {
  const { controlUnits, tvs, cameras } = enrich(db);

  const camerasByTvDeviceId = new Map<string, CameraView[]>();
  const orphanCameras: CameraView[] = [];
  for (const camera of cameras) {
    const tv =
      camera.suitest?.assignedDeviceId !== undefined
        ? tvs.find((t) => t.deviceId === camera.suitest?.assignedDeviceId)
        : undefined;
    if (tv) {
      const list = camerasByTvDeviceId.get(tv.deviceId) ?? [];
      list.push(camera);
      camerasByTvDeviceId.set(tv.deviceId, list);
    } else {
      orphanCameras.push(camera);
    }
  }

  const tvsByCuId = new Map<string, TvView[]>();
  const orphanTvs: TvView[] = [];
  for (const tv of tvs) {
    const cuId = tv.controlUnitIds?.find((id) => controlUnits.some((cu) => cu.id === id));
    if (cuId) {
      const list = tvsByCuId.get(cuId) ?? [];
      list.push(tv);
      tvsByCuId.set(cuId, list);
    } else {
      orphanTvs.push(tv);
    }
  }

  const toGroup = (tv: TvView): TvGroup => ({ tv, cameras: camerasByTvDeviceId.get(tv.deviceId) ?? [] });

  return {
    cuGroups: controlUnits.map((cu) => ({ cu, tvs: (tvsByCuId.get(cu.id) ?? []).map(toGroup) })),
    unallocatedTvs: orphanTvs.map(toGroup),
    orphanCameras,
  };
}

// Candidati Suitest (video-capture-device) non ancora collegati a nessun'altra camera
// (riconciliazione manuale)
export function cameraSuitestCandidates(db: Database, currentVideoCaptureDeviceId: string | undefined) {
  const usedElsewhere = new Set(
    Object.values(db.lab.cameras)
      .map((c) => O.toUndefined(c.videoCaptureDeviceId))
      .filter((id): id is string => id !== undefined && id !== currentVideoCaptureDeviceId),
  );
  return Object.values(db.suitest.videoCaptureDevices)
    .filter((v) => !usedElsewhere.has(v.id))
    .map((v) => ({ id: v.id, primary: v.customName || v.name, secondary: v.assignedDeviceId }));
}

// Riconciliazione manuale invertita ("Link camera" sulla riga TV, non "Link Suitest" sulla riga
// camera): Suitest ha già assegnato un video-capture-device a questa TV
// (`assignedDeviceId === tv.deviceId`), ma nessuna camera locale lo rivendica ancora. Riusa
// `cameraSuitestCandidates` (stessa nozione di "non usato altrove") filtrando sul deviceId della
// TV corrente. Assume al più un match per TV - se Suitest ne assegna più di uno allo stesso
// device, va rivisto.
export function suitestVideoCaptureDeviceForTv(db: Database, tvDeviceId: string): string | undefined {
  return cameraSuitestCandidates(db, undefined).find((c) => c.secondary === tvDeviceId)?.id;
}
