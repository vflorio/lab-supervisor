// La *forma* di un evento di dominio, non un catalogo: gli eventi concreti li dichiara il
// contesto che li emette (A-1), perché un evento appartiene a chi lo produce e nominarli qui
// significherebbe dare al kernel un'opinione sul dominio.
// Ogni evento porta l'istante del fatto: il dossier di un incidente (M-7) si ricostruisce da
// quelli, non dall'orologio di chi lo legge dopo.

import type { Instant } from "./Instant";

export type DomainEvent<Tag extends string, Payload extends object = Record<never, never>> = Readonly<{
  _tag: Tag;
  at: Instant;
}> &
  Readonly<Payload>;
