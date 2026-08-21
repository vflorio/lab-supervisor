// Il mondo già risolto che il tick consegna all'aggregato: la finestra e la custodia di adesso,
// e la fotografia della salute confermata dei device coinvolti.
// È il pezzo che rende INV-3 **strutturale** invece che disciplinare: solo il comando `Tick`
// porta un contesto, quindi solo una transizione innescata da un `Tick` può dispacciare. Una
// transizione senza contesto non *può* farlo — non "si ricorda di non farlo".
// È anche il motivo per cui recovery non possiede sonde (§4.1): la salute arriva già letta.

import type { HealthSnapshot } from "@lab/monitoring/domain/HealthSnapshot";
import type { Custody } from "@lab/registry/domain/Custody";
import type { SupervisionWindow } from "./SupervisionWindow";

export type SupervisionContext = {
  readonly window: SupervisionWindow;
  readonly custody: Custody;
  readonly health: HealthSnapshot;
};

export const make = (window: SupervisionWindow, custody: Custody, health: HealthSnapshot): SupervisionContext => ({
  window,
  custody,
  health,
});
