// Il mirror locale dei dati Suitest, indicizzato per id. Travaso di
// `legacy/core/src/suitest-store/**`, con l'aggiunta che lì non serviva: una scadenza.
// Esiste per una ragione sola, ed è aritmetica. `HealthProbePort.probe` chiede **una faccia alla
// volta**, e la porta è giusta così (è la faccia l'unità di salute, non il device); ma tre endpoint
// HTTP per ognuna delle N facce del lab a ogni tick sarebbero centinaia di chiamate per la stessa
// identica risposta. Il mirror le riduce a tre per tick.
// Lo stato mutabile qui dentro è lecito e altrove no: è un ACL, non un aggregato. Le richieste che
// si accavallano condividono la stessa lettura in volo, altrimenti il primo tick della giornata
// aprirebbe N connessioni insieme.

import type { Clock } from "@lab/kernel";
import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as A from "fp-ts/Apply";
import type * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type * as Http from "../Http";
import type { SuitestClient } from "./Client";
import type * as Codecs from "./Codecs";

export type Snapshot = {
  readonly at: Instant.Instant;
  readonly devices: ReadonlyMap<string, Codecs.Device>;
  readonly controlUnits: ReadonlyMap<string, Codecs.ControlUnit>;
  readonly videoCaptureDevices: ReadonlyMap<string, Codecs.VideoCaptureDevice>;
};

const byId = <T>(items: ReadonlyArray<T>, id: (item: T) => string): ReadonlyMap<string, T> =>
  new Map(items.map((item) => [id(item), item]));

export interface SnapshotSource {
  readonly current: TE.TaskEither<Http.HttpFailure, Snapshot>;
  // Dopo un comando accettato il mirror è vecchio per definizione. Non serve a "verificare" — quella
  // è la `VerificationSpec`, e vive nel dominio — ma a non far leggere alla sonda successiva uno
  // `streamActive` di prima del reboot (FATTO-13).
  readonly invalidate: () => void;
}

// Una lettura sola, senza cache: le tre liste in parallelo, perché sono indipendenti e il tick le
// vuole tutte.
export const fetchOnce = (client: SuitestClient, clock: Clock.Clock): TE.TaskEither<Http.HttpFailure, Snapshot> =>
  pipe(
    A.sequenceS(TE.ApplyPar)({
      devices: client.devices,
      controlUnits: client.controlUnits,
      videoCaptureDevices: client.videoCaptureDevices,
    }),
    TE.map(
      (lists): Snapshot => ({
        at: clock.now(),
        devices: byId(lists.devices, (device) => device.deviceId),
        controlUnits: byId(lists.controlUnits, (unit) => unit.id),
        videoCaptureDevices: byId(lists.videoCaptureDevices, (vcd) => vcd.id),
      }),
    ),
  );

// La sostituzione è integrale a ogni sync, come nel legacy: non c'è stato locale da preservare,
// perché quello vive nel registry e nel monitoring, non qui.
export const cached = (client: SuitestClient, clock: Clock.Clock, ttl: Duration.Duration): SnapshotSource => {
  let fresh: Snapshot | undefined;
  let inFlight: Promise<E.Either<Http.HttpFailure, Snapshot>> | undefined;

  const isStale = (snapshot: Snapshot, now: Instant.Instant): boolean =>
    Duration.Ord.compare(Instant.between(snapshot.at, now), ttl) >= 0;

  return {
    invalidate: () => {
      fresh = undefined;
    },
    current: () => {
      const now = clock.now();
      if (fresh !== undefined && !isStale(fresh, now)) return TE.right(fresh)();
      if (inFlight !== undefined) return inFlight;

      const pending = fetchOnce(client, clock)().then((result) => {
        inFlight = undefined;
        if (result._tag === "Right") fresh = result.right;
        return result;
      });
      inFlight = pending;
      return pending;
    },
  };
};
