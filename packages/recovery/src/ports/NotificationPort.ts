// Riceve un `Incident`, non una stringa: la traduzione in blocchi, colori e menzioni è un
// dettaglio dell'adapter, e il dominio non deve sapere che esiste un posto dove si scrivono
// messaggi. Un incidente con `closedAt` valorizzato è una chiusura, non una nuova segnalazione.
// Qui il canale d'errore **non** è `never`, ed è la differenza con `DeviceControlPort`: un
// rimedio rifiutato è un esito che interessa al dominio, una notifica non consegnata no — è un
// guasto del canale, e chi orchestra decide se ignorarlo o riprovare.

import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { Incident } from "../domain/Incident";

export type NotifyFailed = { readonly _tag: "NotifyFailed"; readonly detail: string };

export const notifyFailed = (detail: string): NotifyFailed => ({ _tag: "NotifyFailed", detail });

export interface NotificationPort {
  readonly publish: (incident: Incident) => TE.TaskEither<NotifyFailed, void>;
}

export interface NotificationEnv {
  readonly notification: NotificationPort;
}

export const publish =
  (incident: Incident): ReaderTaskEither<NotificationEnv, NotifyFailed, void> =>
  (env) =>
    env.notification.publish(incident);
