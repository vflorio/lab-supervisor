// Il composition root vero e proprio: da un `Config` costruisce l'unico record che tutti i casi
// d'uso chiedono come `Env`. È l'unico file del repository in cui si vedono insieme adb, Suitest,
// Slack e le porte del dominio — ed è giusto così: ogni altro file ne conosce solo una faccia
// (A-5, terza riga: `adapters/ (cfg) => Partial<AppEnv>`).
// Le sostituzioni servono a montare il servizio intero senza un lab a cui parlare: i finti di
// `@lab/hardware-control/testing` sono scritti per questo, e il test end-to-end del servizio è
// esattamente il servizio con quei tre parametri diversi.

import { SlackNotifier } from "@lab/alerting";
import {
  AdbDeviceControl,
  AdbHealthProbe,
  RoutingDeviceControl,
  RoutingHealthProbe,
  SuitestDeviceControl,
  SuitestHealthProbe,
} from "@lab/hardware-control";
import type { ClockEnv } from "@lab/kernel";
import type { Clock } from "@lab/kernel/Clock";
import type * as FacetHealthRepository from "@lab/monitoring/ports/FacetHealthRepository";
import type * as HealthProbePort from "@lab/monitoring/ports/HealthProbePort";
import { ComposedSupervision } from "@lab/recovery";
import type * as DeviceControlPort from "@lab/recovery/ports/DeviceControlPort";
import type * as IdsPort from "@lab/recovery/ports/IdsPort";
import type * as NotificationPort from "@lab/recovery/ports/NotificationPort";
import type * as RecoverySessionRepository from "@lab/recovery/ports/RecoverySessionRepository";
import type * as SupervisionPort from "@lab/recovery/ports/SupervisionPort";
import type * as SupervisionProfileRepository from "@lab/recovery/ports/SupervisionProfileRepository";
import type * as DeviceRepository from "@lab/registry/ports/DeviceRepository";
import * as LoggingNotifier from "./adapters/LoggingNotifier";
import * as RandomSessionIds from "./adapters/RandomSessionIds";
import * as SystemClock from "./adapters/SystemClock";
import type { Config } from "./config/Config";
import type { Logger } from "./Logger";
import * as Persistence from "./Persistence";

// Tutte le porte che i casi d'uso dichiarano, in un record solo. Che l'unione stia qui e non dentro
// un package è il punto: nessun bounded context conosce le porte degli altri.
export type AppEnv = ClockEnv &
  DeviceRepository.DeviceRepositoryEnv &
  FacetHealthRepository.FacetHealthRepositoryEnv &
  HealthProbePort.HealthProbeEnv &
  RecoverySessionRepository.RecoverySessionRepositoryEnv &
  SupervisionProfileRepository.SupervisionProfileRepositoryEnv &
  SupervisionPort.SupervisionEnv &
  DeviceControlPort.DeviceControlEnv &
  NotificationPort.NotificationEnv &
  IdsPort.IdsEnv;

// I tre punti in cui il servizio tocca il mondo: due processi e una rete. Sostituirli è tutto ciò
// che serve per far girare il ciclo intero su un banco.
export type Substitutes = {
  readonly clock?: Clock;
  readonly spawn?: AdbHealthProbe.Options["spawn"];
  readonly suitestTransport?: SuitestHealthProbe.Options["transport"];
  readonly slackTransport?: Parameters<typeof SlackNotifier.make>[1];
};

export type Environment = {
  readonly env: AppEnv;
  readonly stores: Persistence.Stores;
};

export const make = (config: Config, logger: Logger, substitutes: Substitutes = {}): Environment => {
  const clock = substitutes.clock ?? SystemClock.make();
  const stores = Persistence.make();

  // Una porta riceve un `DeviceId`, mai un indirizzo: la traduzione è mestiere dell'ACL, e
  // l'anagrafica è l'unica che la conosce (NO-9).
  const lookup = stores.devices.findById;

  const suitestProbe = SuitestHealthProbe.make(config.suitest, {
    lookup,
    clock,
    snapshotTtl: config.monitoring.snapshotTtl,
    transport: substitutes.suitestTransport,
  });

  const healthProbe = RoutingHealthProbe.make(
    RoutingHealthProbe.byFacet(
      AdbHealthProbe.make(config.adb, { lookup, clock, spawn: substitutes.spawn }),
      suitestProbe,
    ),
    lookup,
    clock,
  );

  const deviceControl = RoutingDeviceControl.make(
    RoutingDeviceControl.byKind(
      AdbDeviceControl.make(config.adb, { lookup, spawn: substitutes.spawn }),
      SuitestDeviceControl.make(config.suitest, {
        lookup,
        transport: substitutes.suitestTransport,
        // Chi comanda avvisa chi osserva che la fotografia non vale più (FATTO-13).
        onDispatched: suitestProbe.invalidate,
      }),
    ),
    lookup,
  );

  return {
    stores,
    env: {
      clock,
      deviceRepository: stores.devices,
      facetHealthRepository: stores.health,
      healthProbe,
      recoverySessionRepository: stores.sessions,
      supervisionProfileRepository: stores.profiles,
      supervision: ComposedSupervision.make({
        devices: stores.devices,
        health: stores.health,
        profiles: stores.profiles,
      }),
      deviceControl,
      // Senza Slack l'incidente si consegna comunque, su un canale più povero: un supervisore che
      // tace perché manca un token è peggio di uno che scrive a video.
      notification: config.slack.active
        ? SlackNotifier.make(config.slack, substitutes.slackTransport)
        : LoggingNotifier.make(logger.child("Incident")),
      ids: RandomSessionIds.make(),
    },
  };
};
