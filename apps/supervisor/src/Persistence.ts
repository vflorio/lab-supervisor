// Dove il servizio tiene ciò che ricorda, e per questa prima versione la risposta è: in memoria.
// È una scelta dichiarata, non una dimenticanza. Le tre porte sono già il posto in cui una
// persistenza vera atterrerà (NO-13 la nomina: SQLite), e finché non c'è il conto da pagare è
// questo, scritto qui perché nessuno lo scopra a caldo:
//   · anagrafica — la ricostruisce il file di configurazione a ogni avvio, quindi non si perde
//     nulla; ciò che si perde è una custodia concessa a runtime, che oggi nessuno può concedere
//     perché il servizio non espone ancora un'API;
//   · salute — un riavvio riparte da `Unknown` e la riconferma in qualche giro di sonde;
//   · sessioni — un recupero in volo al momento del riavvio **si perde**, e il device resta giù
//     finché le sonde non lo riportano `Unhealthy` e la correlazione non riapre.
// Gli adapter sono quelli già scritti e già messi alla prova nei package: montarli qui è la
// decisione del composition root, cioè il file il cui mestiere è scegliere gli adapter, ed è
// preferibile a una seconda copia in memoria che diverga in silenzio.

import { InMemoryFacetHealthRepository } from "@lab/monitoring/testing";
import { InMemoryRecoverySessionRepository, InMemorySupervisionProfileRepository } from "@lab/recovery/testing";
import { InMemoryDeviceRepository } from "@lab/registry/testing";

export type Stores = {
  readonly devices: InMemoryDeviceRepository.InMemoryDeviceRepository;
  readonly health: InMemoryFacetHealthRepository.InMemoryFacetHealthRepository;
  readonly profiles: InMemorySupervisionProfileRepository.InMemorySupervisionProfileRepository;
  readonly sessions: InMemoryRecoverySessionRepository.InMemoryRecoverySessionRepository;
};

export const make = (): Stores => ({
  devices: InMemoryDeviceRepository.make(),
  health: InMemoryFacetHealthRepository.make(),
  profiles: InMemorySupervisionProfileRepository.make(),
  sessions: InMemoryRecoverySessionRepository.make(),
});
