// ACL verso Suitest per le scritture. Il client sta già in `legacy/core/src/adapters/suitest.ts` e
// funziona — non è stato reimplementato, è stato avvolto (`internal/suitest/Client`).
// Attua **un solo** rimedio: `RebootHardware` su una ControlUnit, che è l'unica scrittura hardware
// che la Public API espone (FATTO-10). Accendere una CU o comandare una TV non si può fare da qui:
// quel canale sarà lo smart plug, e finché non arriva l'esito è `Unsupported` (FATTO-5, NF-3). Non è
// una lacuna dell'adapter, è come sta il mondo — e `Unsupported` fa arrendere la sessione subito
// invece di ritentare a vuoto (FL-2, S9).
// Il suo mestiere è tradurre **tutto** in `RemedyOutcome` (A-6): un 4xx diventa `Rejected`, un
// timeout `TransportError`. Se un errore di libreria attraversa la porta, l'ACL ha perso (NO-10).

import type { Remedy } from "@lab/recovery/domain/Remedy";
import { requiredCapability } from "@lab/recovery/domain/Remedy";
import * as RemedyOutcome from "@lab/recovery/domain/RemedyOutcome";
import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";
import type { Device } from "@lab/registry/domain/Device";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import type { DeviceLookup } from "./DeviceLookup";
import type * as Http from "./internal/Http";
import * as Client from "./internal/suitest/Client";

export type { SuitestConfig } from "./internal/suitest/Client";

export type Options = {
  readonly lookup: DeviceLookup;
  readonly transport?: Http.Transport;
  // Dopo un comando accettato la fotografia Suitest è vecchia per definizione. Invalidarla non
  // *verifica* nulla — la verifica è del dominio (INV-5) — ma impedisce che la sonda successiva
  // legga un `online` di prima del reboot (FATTO-13).
  readonly onDispatched?: () => void;
};

// La traduzione che decide cosa la sessione scriverà nel dossier, e quindi se ritenterà.
// Un 404 è "Suitest non vede quell'unità": irraggiungibile, non rifiutato. Un altro 4xx è un rifiuto
// motivato, e la motivazione finisce nel dossier. Tutto il resto — 5xx, timeout, rete giù, risposta
// malformata — è il nostro canale che ha ceduto, non il device (FATTO-12).
const toOutcome = (failure: Http.HttpFailure): RemedyOutcome.RemedyOutcome => {
  switch (failure._tag) {
    case "BadStatus":
      if (failure.status === 404) return RemedyOutcome.unreachable;
      return failure.status < 500
        ? RemedyOutcome.rejected(`Suitest ${failure.status}: ${failure.body.slice(0, 200)}`)
        : RemedyOutcome.transportError(`Suitest ${failure.status}`);
    case "Timeout":
      return RemedyOutcome.transportError(`no response from Suitest within ${failure.afterMs}ms`);
    case "Unreachable":
      return RemedyOutcome.transportError(`Suitest unreachable: ${failure.detail}`);
    case "Malformed":
      return RemedyOutcome.transportError(`Suitest response not conforming: ${failure.detail}`);
  }
};

// Il solo rimedio nel mandato di questo adapter, e il solo kind su cui sa attuarlo. Ogni altra
// coppia esce di qui come `Unsupported`: non è questo adapter a sapere chi altro potrebbe farcela,
// è il routing (A-7).
const isInMandate = (device: Device, remedy: Remedy): boolean =>
  device.kind === "ControlUnit" && remedy._tag === "RebootHardware";

export const make = (config: Client.SuitestConfig, options: Options): DeviceControlPort => {
  const client = Client.make(config, options.transport);

  const dispatch = (unitId: string): T.Task<RemedyOutcome.RemedyOutcome> =>
    pipe(
      client.rebootControlUnit(unitId),
      TE.matchW(toOutcome, () => {
        options.onDispatched?.();
        // `Accepted` significa "preso in carico", mai "guarito": quello lo stabilisce solo la
        // verifica (INV-5), e fra il comando e lo spegnimento passano secondi (FATTO-13).
        return RemedyOutcome.accepted;
      }),
    );

  const resolve = (device: Device, remedy: Remedy): T.Task<RemedyOutcome.RemedyOutcome> => {
    if (!isInMandate(device, remedy)) return T.of(RemedyOutcome.unsupported);

    // Ciò che *quella istanza* dichiara, non ciò che il suo tipo potrebbe fare: non tutte le CU si
    // riavviano (FATTO-1), e chi non lo sa fare non lo saprà mai (FL-2, S9).
    if (!device.capabilities.has(requiredCapability(remedy))) return T.of(RemedyOutcome.unsupported);

    return pipe(
      device.endpoints.suitest,
      O.match(
        () => T.of(RemedyOutcome.rejected("nessun riferimento Suitest per questo device")),
        (unitId) => dispatch(String(unitId)),
      ),
    );
  };

  return {
    apply: (deviceId, remedy) =>
      pipe(
        options.lookup(deviceId),
        TE.flatMapTask(
          O.match(
            // Un device che l'anagrafica non conosce non è un guasto dell'hardware: è un guasto del
            // montaggio, e va scritto nel dossier con quelle parole.
            () => T.of(RemedyOutcome.rejected(`device ${deviceId} non presente in anagrafica`)),
            (device: Device) => resolve(device, remedy),
          ),
        ),
      ),
  };
};
