import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import type { Device, DeviceStatus } from "../adapters/suitest";
import type { CandyboxEntry } from "../lab-registry/candybox";
import * as Network from "../network";

// Shared-host failure detection: se TUTTI i device controllati da uno stesso Candybox/Raspberry
// risultano OFFLINE, l'host condiviso (la control unit) è quasi certamente bloccato - anche
// quando Suitest la riporta ancora `online: true` (processo vivo ma incastrato).
// Il rimedio è un reboot diretto via SSH.

export interface StuckCandybox {
  readonly id: string;
  readonly label: string;
  readonly host: Network.Host;
}

// Topologia device -> Candybox: dallo specchio Suitest servono solo id e control unit di
// appartenenza. Lo status corrente NON viene letto qui (sarebbe quello stale dello specchio):
// arriva dal fact stream, live, via `statusOf`.
export type DeviceTopology = Pick<Device, "deviceId" | "controlUnitIds">;

// `OFFLINE`/`CANDYBOX_OFFLINE` = irraggiungibile. `OFF` (spento di proposito) NON è offline, così
// una TV spenta a mano non fa mai scattare il reboot. Uno status ignoto (nessun fatto ancora) non
// è offline: conservativo, non riavvia su stato incerto.
const OFFLINE_STATUSES: readonly DeviceStatus[] = ["OFFLINE", "CANDYBOX_OFFLINE"];

const isOffline = (status?: string): boolean =>
  typeof status !== "undefined" && (OFFLINE_STATUSES as readonly string[]).includes(status);

// Un Candybox è "bloccato" se: è `controlled` (non in manutenzione), ha un ip SSH risolvibile
// (solo `personal-pi`), controlla almeno un device e TUTTI i suoi device sono OFFLINE.
export const detectStuckCandyboxes = (
  candyboxes: Record<string, CandyboxEntry>,
  devices: readonly DeviceTopology[],
  statusOf: (deviceId: string) => string | undefined,
): readonly StuckCandybox[] =>
  Object.values(candyboxes).flatMap((candybox) => {
    if (!candybox.controlled) return [];

    const host = pipe(
      candybox.ip,
      O.chain((ip) => O.fromEither(Network.decodeHost(ip))),
    );
    if (O.isNone(host)) return [];

    const owned = devices.filter((device) => device.controlUnitIds.includes(candybox.id));
    if (owned.length === 0) return [];
    if (!owned.every((device) => isOffline(statusOf(device.deviceId)))) return [];

    return [{ id: candybox.id, label: candybox.label, host: host.value }];
  });
