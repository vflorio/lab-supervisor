// L'attuazione di `NotificationPort` su Slack. In questo giro solo la firma (NO-14).
// Travaso: `legacy/core/src/adapters/slack.ts`, che funziona già.
// Si notifica a rimedi esauriti, oppure subito se il profilo dichiara criticità immediata
// (FATTO-16) — ma quella decisione è già stata presa dal core: qui arriva un `Incident` e basta.
// Il canale d'errore non è `never`: una notifica non consegnata è un guasto del canale, non un
// esito che interessi al recupero.

import type { NotificationPort } from "@lab/recovery/ports/NotificationPort";

export type SlackConfig = {
  readonly webhookUrl: string;
  readonly channel: string;
};

export declare const make: (config: SlackConfig) => NotificationPort;
