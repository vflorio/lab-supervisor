// L'implementazione di `SupervisionPort`: compone anagrafica, salute confermata e profili per
// rispondere alle due domande che una sessione fa al mondo. Non è un fake e non ha niente di
// in-memory — le tre porte sotto sono quelle che il composition root le passa, fake nei test e
// adapter veri in produzione: è il percorso di produzione, e per questo vive in `application/`.
// È anche il punto in cui il confine di §4.1 si vede: la salute che arriva qui è quella
// **confermata** dal monitoring, e recovery non ha modo di sondare per conto suo.
// La custodia e la finestra si rileggono a ogni chiamata: sono le sole cose che restano live a
// recupero iniziato (INV-13).

import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import type { FacetHealthRepository } from "@lab/monitoring/ports/FacetHealthRepository";
import * as Custody from "@lab/registry/domain/Custody";
import type { DeviceRepository } from "@lab/registry/ports/DeviceRepository";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as RecoveryTarget from "../domain/RecoveryTarget";
import * as SupervisionWindow from "../domain/SupervisionWindow";
import type { SupervisionPort } from "../ports/SupervisionPort";
import type { SupervisionProfileRepository } from "../ports/SupervisionProfileRepository";

export const make = (deps: {
  readonly devices: DeviceRepository;
  readonly health: FacetHealthRepository;
  readonly profiles: SupervisionProfileRepository;
}): SupervisionPort => {
  const profileOf = (target: RecoveryTarget.RecoveryTarget) =>
    pipe(
      deps.devices.findById(RecoveryTarget.actsOn(target)),
      TE.flatMap(
        O.fold(
          () => TE.right(O.none),
          (device) => deps.profiles.forKind(device.kind),
        ),
      ),
    );

  return {
    profileFor: profileOf,
    contextFor: (target) =>
      pipe(
        TE.Do,
        TE.apS("device", deps.devices.findById(RecoveryTarget.actsOn(target))),
        TE.apS("profile", profileOf(target)),
        TE.apS("health", deps.health.snapshotOf([...RecoveryTarget.members(target)])),
        TE.map(({ device, profile, health }) => ({
          // Senza profilo non c'è autorizzazione: un device che ha smesso di avere una policy non
          // continua a ricevere comandi per inerzia.
          window: pipe(
            profile,
            O.map((found) => found.window),
            O.getOrElse(() => SupervisionWindow.closed),
          ),
          custody: pipe(
            device,
            O.map((found) => found.custody),
            O.getOrElse(() => Custody.supervisor),
          ),
          health: O.isSome(device) ? health : HealthSnapshot.empty,
        })),
      ),
  };
};
