// I fatti che il monitoring pubblica, e sono solo due. Nomi al passato, fatti, mai decisioni:
// non esiste e non deve esistere un `RecoveryNeeded` (§4.1), perché significherebbe che il
// monitoring sta decidendo al posto del core. *Quando* un fatto diventa un problema di
// business lo stabilisce recovery, ed è una policy configurabile per tipo di device.
// `at` è l'istante della conferma, `since` quello in cui il guasto è cominciato: sono due cose
// diverse e il core usa il secondo.

import type { DomainEvent } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type { Facet } from "./Facet";

export type FacetBecameUnhealthy = DomainEvent<
  "FacetBecameUnhealthy",
  { deviceId: DeviceId; facet: Facet; since: Instant }
>;

export type FacetBecameHealthy = DomainEvent<
  "FacetBecameHealthy",
  { deviceId: DeviceId; facet: Facet; since: Instant }
>;

export type MonitoringEvent = FacetBecameUnhealthy | FacetBecameHealthy;
