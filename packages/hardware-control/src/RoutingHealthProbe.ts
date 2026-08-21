// Lo smistamento delle sonde, simmetrico a `RoutingDeviceControl` e per la stessa ragione (A-7):
// esiste una sola `HealthProbePort`, e l'application layer che batte il tick non deve sapere che
// una faccia si legge da Suitest e un'altra da adb.
// Smista su `(kind, facet)` perché è la coppia che decide il protocollo: `Reachable` di una TV è un
// campo Suitest, `AdbTransport` di una camera è un comando adb, e domani `ContainerAlive` sarà CDP
// (FL-4) — allora questa tabella cresce di una riga e nient'altro cambia.
// Una coppia senza rotta non è un guasto dell'hardware: è un errore di montaggio, e l'esito lo dice
// con quelle parole invece di far passare per malato un device sano.

import type { Clock } from "@lab/kernel";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as ProbeOutcome from "@lab/monitoring/domain/ProbeOutcome";
import type { HealthProbePort } from "@lab/monitoring/ports/HealthProbePort";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import type { DeviceLookup } from "./DeviceLookup";

export type Route = (kind: DeviceKind, facet: Facet) => O.Option<HealthProbePort>;

// La tabella del lab di oggi. `facetsOf` in monitoring dice *quali* facce esistono per un kind;
// questa dice *chi le legge*, ed è l'unica delle due che ha il diritto di conoscere i protocolli.
export const byFacet = (adb: HealthProbePort, suitest: HealthProbePort): Route => {
  const table: Record<DeviceKind, Partial<Record<Facet, HealthProbePort>>> = {
    ControlUnit: { Reachable: suitest },
    Tv: { Reachable: suitest },
    AndroidCamera: { AdbTransport: adb, StreamAvailable: suitest },
  };
  return (kind, facet) => O.fromNullable(table[kind][facet]);
};

export const make = (route: Route, lookup: DeviceLookup, clock: Clock.Clock): HealthProbePort => ({
  probe: (ref) =>
    pipe(
      lookup(ref.deviceId),
      TE.flatMap(
        O.match(
          () =>
            TE.right<never, ProbeOutcome.ProbeOutcome>(
              ProbeOutcome.make(ref, clock.now(), false, O.some("device non presente in anagrafica")),
            ),
          (device) =>
            pipe(
              route(device.kind, ref.facet),
              O.match(
                () =>
                  TE.right<never, ProbeOutcome.ProbeOutcome>(
                    ProbeOutcome.make(
                      ref,
                      clock.now(),
                      false,
                      O.some(`nessuna sonda per ${ref.facet} su un ${device.kind}`),
                    ),
                  ),
                (port) => port.probe(ref),
              ),
            ),
        ),
      ),
    ),
});
