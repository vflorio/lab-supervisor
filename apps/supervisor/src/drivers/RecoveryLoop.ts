// Il battito del recupero. Due cose, in quest'ordine.
// Primo: la finestra. Ogni profilo ne dichiara una, ed è un'autorizzazione, non un orario
// (FATTO-14). Quando si chiude, le sessioni che essa autorizzava vanno fermate **subito**: il tick
// lo farebbe comunque, perché la finestra è live a ogni tick (INV-13), ma aspettare il prossimo
// battito significherebbe lasciare in volo un comando che nessuno voleva più (INV-3).
// Secondo: `TickDueSessions`, che è tutto il resto — le sessioni dovute avanzano, i comandi
// partono, gli incidenti si consegnano.
// Il passaggio aperto→chiuso lo ricorda questo modulo, e non il dominio: è una proprietà del
// *processo* che gira, non del modello, e il modello non ha un elenco di "tutte le sessioni".

import * as Clock from "@lab/kernel/Clock";
import type { Instant } from "@lab/kernel/Instant";
import { onSupervisionWindowClosed, SupervisionWindow, TickDueSessions } from "@lab/recovery";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import * as DeviceRepository from "@lab/registry/ports/DeviceRepository";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { Config } from "../config/Config";
import type { AppEnv } from "../Environment";
import { describeRecovery } from "../Events";
import type { Logger } from "../Logger";

export interface RecoveryLoop {
  readonly cycle: RTE.ReaderTaskEither<AppEnv, never, void>;
}

const closingKinds = (config: Config, wasOpen: Map<DeviceKind, boolean>, now: Instant): ReadonlyArray<DeviceKind> =>
  config.profiles.flatMap((profile) => {
    const open = SupervisionWindow.isOpen(profile.window, now);
    const closing = wasOpen.get(profile.kind) === true && !open;
    wasOpen.set(profile.kind, open);
    return closing ? [profile.kind] : [];
  });

export const make = (config: Config, logger: Logger): RecoveryLoop => {
  // Al primo giro nessuna finestra risulta "appena chiusa": all'avvio non c'è niente in volo da
  // fermare, e dichiararla chiusa da sempre farebbe partire un abort di cortesia su zero sessioni.
  const wasOpen = new Map<DeviceKind, boolean>();

  const stopWhatTheWindowNoLongerAuthorises = (now: Instant): RTE.ReaderTaskEither<AppEnv, never, void> =>
    pipe(
      closingKinds(config, wasOpen, now),
      RTE.traverseSeqArray((kind: DeviceKind) =>
        pipe(
          DeviceRepository.findByKind(kind),
          RTE.tapIO((devices) => () => logger.info(`finestra chiusa per ${kind}: fermo ${devices.length} device`)),
          RTE.flatMap((devices) =>
            onSupervisionWindowClosed.execute(
              devices.map((device) => device.id),
              now,
            ),
          ),
          RTE.tapIO((events) => () => {
            for (const event of events) logger.info(describeRecovery(event));
          }),
        ),
      ),
      RTE.asUnit,
    );

  return {
    cycle: pipe(
      Clock.now,
      RTE.flatMap((now) =>
        pipe(
          stopWhatTheWindowNoLongerAuthorises(now),
          RTE.flatMap(() => TickDueSessions.execute(now)),
        ),
      ),
      RTE.tapIO((output) => () => {
        for (const event of output.events) logger.info(describeRecovery(event));
        for (const incident of output.incidents)
          logger.warn(`incidente consegnato per la sessione ${String(incident.sessionId)}`);
      }),
      RTE.asUnit,
    ),
  };
};
