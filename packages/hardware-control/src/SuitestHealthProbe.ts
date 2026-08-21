// Le sonde che leggono Suitest, una faccia alla volta (M-3). `Reachable` per una CU è il campo
// `online` per unità (FATTO-6); per una TV è lo `status` del device (FATTO-7); `StreamAvailable` per
// una camera è `streamActive` **e** `online` del video-capture-device associato (FATTO-8).
// Travaso di `legacy/core/src/adapters/suitest.ts` e `suitest-store/sync.ts`. Le letture passano
// tutte dal mirror con scadenza (`internal/suitest/Snapshot`): la porta chiede una faccia per volta,
// ma tre chiamate HTTP per faccia sarebbero centinaia identiche a ogni tick.
// Traduce tutto in `ProbeOutcome`: una sonda che fallisce ha appena fatto il suo lavoro, e il canale
// d'errore della porta è `never` (A-6). Non sapere non è una buona notizia — Suitest muto significa
// `ok: false` con la ragione scritta, perché un lab che non si osserva è un lab che ha un problema.

import type { Clock } from "@lab/kernel";
import type { Duration } from "@lab/kernel/Duration";
import type { Instant } from "@lab/kernel/Instant";
import type { FacetRef } from "@lab/monitoring/domain/FacetRef";
import * as ProbeOutcome from "@lab/monitoring/domain/ProbeOutcome";
import type { HealthProbePort } from "@lab/monitoring/ports/HealthProbePort";
import type { Device } from "@lab/registry/domain/Device";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import type { DeviceLookup } from "./DeviceLookup";
import * as Http from "./internal/Http";
import * as Client from "./internal/suitest/Client";
import * as Reachability from "./internal/suitest/Reachability";
import * as Snapshot from "./internal/suitest/Snapshot";

export type { SuitestConfig } from "./internal/suitest/Client";

export type Options = {
  readonly lookup: DeviceLookup;
  readonly clock: Clock.Clock;
  // Quanto a lungo il mirror resta buono. Va tenuta sotto il periodo del tick delle sonde: se due
  // tick di fila leggessero la stessa fotografia, l'anti-flapping conterebbe due volte la stessa
  // osservazione e un guasto risulterebbe confermato prima del dovuto.
  readonly snapshotTtl: Duration;
  readonly transport?: Http.Transport;
};

// Un esito negativo con la ragione scritta. Serve ogni volta che la risposta è "no" o "non lo so",
// e in entrambi i casi la diagnosi è ciò che evita di dover aprire i log (FATTO-16).
const negative = (ref: FacetRef, at: Instant, reason: string): ProbeOutcome.ProbeOutcome =>
  ProbeOutcome.make(ref, at, false, O.some(reason));

const positive = (ref: FacetRef, at: Instant): ProbeOutcome.ProbeOutcome => ProbeOutcome.make(ref, at, true);

// La sonda, più la sola leva che il composition root deve poter tirare su di lei: dopo un comando
// accettato la fotografia è vecchia per definizione, e chi dispaccia il rimedio (`SuitestDeviceControl`)
// deve poter dire a chi osserva che quella lettura non vale più (FATTO-13). Non è una verifica —
// quella è del dominio (INV-5) — è non far leggere alla sonda successiva un `online` di prima del
// reboot.
export interface SuitestHealthProbe extends HealthProbePort {
  readonly invalidate: () => void;
}

export const make = (config: Client.SuitestConfig, options: Options): SuitestHealthProbe => {
  const client = Client.make(config, options.transport);
  const snapshots = Snapshot.cached(client, options.clock, options.snapshotTtl);

  // L'istante dell'esito è quello della fotografia, non quello della domanda: è quando
  // l'osservazione è stata fatta davvero, ed è ciò che rende confrontabile un `since` con l'istante
  // di un dispaccio (FATTO-13, INV-5).
  const readFacet = (ref: FacetRef, device: Device, suitestId: string, snapshot: Snapshot.Snapshot) => {
    const at = snapshot.at;

    switch (ref.facet) {
      case "StreamAvailable": {
        const vcd = snapshot.videoCaptureDevices.get(suitestId);
        if (vcd === undefined) return negative(ref, at, `video-capture-device ${suitestId} sconosciuto a Suitest`);
        // Le due letture insieme: uno stream dichiarato attivo da un device offline non è uno stream.
        return vcd.online && vcd.streamActive
          ? positive(ref, at)
          : negative(ref, at, `online=${vcd.online}, streamActive=${vcd.streamActive}`);
      }

      case "Reachable": {
        if (device.kind === "ControlUnit") {
          const unit = snapshot.controlUnits.get(suitestId);
          if (unit === undefined) return negative(ref, at, `control unit ${suitestId} sconosciuta a Suitest`);
          return unit.online ? positive(ref, at) : negative(ref, at, "online=false");
        }
        if (device.kind === "Tv") {
          const tv = snapshot.devices.get(suitestId);
          if (tv === undefined) return negative(ref, at, `device ${suitestId} sconosciuto a Suitest`);
          return Reachability.isReachable(tv.status)
            ? positive(ref, at)
            : negative(ref, at, Reachability.describe(tv.status));
        }
        return negative(ref, at, `Reachable non è una faccia osservabile via Suitest per un ${device.kind}`);
      }

      // `AdbTransport` non si osserva da qui: se arriva fin qui è un errore di instradamento, non un
      // device giù. L'esito resta negativo — è l'unica cosa che la porta sa dire — ma con scritto
      // perché, così chi legge l'incidente vede subito che il guasto è nel montaggio.
      case "AdbTransport":
        return negative(ref, at, "AdbTransport non si osserva via Suitest: instradamento sbagliato");
    }
  };

  const onSnapshot = (ref: FacetRef, device: Device, suitestId: string): T.Task<ProbeOutcome.ProbeOutcome> =>
    pipe(
      snapshots.current,
      TE.matchW(
        (failure: Http.HttpFailure) => negative(ref, options.clock.now(), Http.describe(failure)),
        (snapshot) => readFacet(ref, device, suitestId, snapshot),
      ),
    );

  const outcomeFor = (ref: FacetRef, found: O.Option<Device>): T.Task<ProbeOutcome.ProbeOutcome> =>
    pipe(
      found,
      O.match(
        () => T.of(negative(ref, options.clock.now(), "device non presente in anagrafica")),
        (device) =>
          pipe(
            // Una camera può esistere in anagrafica senza chiave esterna Suitest (FATTO-9): mancare
            // è un esito, non un'eccezione.
            device.endpoints.suitest,
            O.match(
              () => T.of(negative(ref, options.clock.now(), "nessun riferimento Suitest per questo device")),
              (suitestId) => onSnapshot(ref, device, suitestId),
            ),
          ),
      ),
    );

  return {
    invalidate: snapshots.invalidate,
    probe: (ref) =>
      pipe(
        options.lookup(ref.deviceId),
        TE.flatMapTask((found) => outcomeFor(ref, found)),
      ),
  };
};
