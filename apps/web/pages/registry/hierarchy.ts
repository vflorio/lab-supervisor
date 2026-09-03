import type * as Network from "@supervisor/core/network";
import * as O from "fp-ts/Option";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import type { CameraView, ControlUnitView, Database, Hierarchy, TvGroup, TvView } from "./types";
import type { SortBy } from "./useRegistryFilters";

// Stato di raggiungibilità ADB dell'host assegnato alla camera (fisico, via `adb devices`) -
// distinto da `camera.suitest.online`, che riflette invece lo stato dell'app suitest-camera.
// Il registry tiene solo l'IP, `adbDevices[].target` è "ip:port" live: si confronta il solo IP.
export function adbStatusFor(
  adbDevices: readonly AdbDevice[],
  target: Network.Host | undefined,
): AdbDevice["status"] | null {
  if (!target) return null;
  return adbDevices.find((d) => d.target.startsWith(`${target.ip}:`))?.status ?? "disconnect";
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

// Ordina la gerarchia per nome o IP - puramente di rendering, non tocca raggruppamento/join.
// Le Control Unit non hanno un IP nel dominio (nessun campo sul CandyboxEntry) quindi restano
// sempre ordinate per nome, qualunque sia `sortBy`; IP mancante finisce in coda.
function byName<T extends { label: string }>(a: T, b: T): number {
  return a.label.localeCompare(b.label);
}

function byIp<T extends { label: string }>(ip: (item: T) => string | undefined) {
  return (a: T, b: T) => {
    const ipA = ip(a);
    const ipB = ip(b);
    if (ipA === undefined && ipB === undefined) return byName(a, b);
    if (ipA === undefined) return 1;
    if (ipB === undefined) return -1;
    return ipA.localeCompare(ipB, undefined, { numeric: true }) || byName(a, b);
  };
}

const tvComparator = (sortBy: SortBy) =>
  sortBy === "ip" ? byIp<TvView>((tv) => O.toUndefined(tv.ip)) : byName<TvView>;
const cameraComparator = (sortBy: SortBy) =>
  sortBy === "ip" ? byIp<CameraView>((camera) => camera.adb?.target.ip) : byName<CameraView>;

export function sortHierarchy(hierarchy: Hierarchy, sortBy: SortBy): Hierarchy {
  const sortTvGroup = (group: TvGroup): TvGroup => ({
    ...group,
    cameras: [...group.cameras].sort(cameraComparator(sortBy)),
  });

  return {
    cuGroups: [...hierarchy.cuGroups]
      .sort((a, b) => byName(a.cu, b.cu))
      .map((group) => ({
        ...group,
        tvs: [...group.tvs].sort((a, b) => tvComparator(sortBy)(a.tv, b.tv)).map(sortTvGroup),
      })),
    unallocatedTvs: [...hierarchy.unallocatedTvs].sort((a, b) => tvComparator(sortBy)(a.tv, b.tv)).map(sortTvGroup),
    orphanCameras: [...hierarchy.orphanCameras].sort(cameraComparator(sortBy)),
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
