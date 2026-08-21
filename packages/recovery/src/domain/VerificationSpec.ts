// Come si accerta la guarigione dopo un rimedio.
// `settleDelay` è la traduzione diretta del FATTO-13: un reboot appena impartito non spegne il
// device all'istante, e per qualche secondo continua a rispondere. Guardare subito dopo il
// comando dichiarerebbe guarito un device che si sta ancora spegnendo — per questo la prima
// occhiata arriva dopo l'assestamento, e non basta comunque: serve anche che la guarigione sia
// *posteriore* al dispaccio (INV-5).
// La verifica legge la salute confermata dal monitoring, non esegue sonde proprie (§4.1).

import type { Duration } from "@lab/kernel/Duration";
import type { Facet } from "@lab/monitoring/domain/Facet";

export type VerificationSpec = {
  readonly facet: Facet;
  readonly settleDelay: Duration;
  readonly pollInterval: Duration;
  readonly timeout: Duration;
};

export const make = (
  facet: Facet,
  settleDelay: Duration,
  pollInterval: Duration,
  timeout: Duration,
): VerificationSpec => ({ facet, settleDelay, pollInterval, timeout });
