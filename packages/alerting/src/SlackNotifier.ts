// L'attuazione di `NotificationPort` su Slack. Travaso di `legacy/core/src/adapters/slack.ts`, che
// funziona già: cambia solo il trasporto, che qui è iniettato invece di essere `fetch` cablato.
// Si notifica a rimedi esauriti, oppure subito se il profilo dichiara criticità immediata
// (FATTO-16) — ma quella decisione è già stata presa dal core: qui arriva un `Incident` e basta.
// Il canale d'errore non è `never`, ed è la differenza con `DeviceControlPort`: una notifica non
// consegnata è un guasto del canale, non un esito che interessi al recupero (A-6).
// Slack risponde `200 OK` con `{"ok": false}` dentro: un `chat.postMessage` che fallisce senza che
// nessuno se ne accorga è il difetto classico di questa API, e il legacy lo controllava già.

import type { Incident } from "@lab/recovery/domain/Incident";
import type { NotificationPort } from "@lab/recovery/ports/NotificationPort";
import { notifyFailed } from "@lab/recovery/ports/NotificationPort";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as IncidentMessage from "./IncidentMessage";
import * as Http from "./internal/Http";

export type SlackConfig = {
  readonly baseUrl: string;
  readonly botToken: string;
  readonly channel: string;
  readonly timeoutMs: number;
};

export const defaultBaseUrl = "https://slack.com/api";

// I blocchi neutri di `IncidentMessage` vestiti da Slack. È l'unico punto del package che sa cosa
// sia un `mrkdwn`, ed è di proposito: cambiare canale significa riscrivere questa funzione e nulla
// più.
const toSlackBlocks = (blocks: ReadonlyArray<IncidentMessage.MessageBlock>): ReadonlyArray<unknown> =>
  blocks.map((block) => {
    switch (block.kind) {
      case "header":
        // L'header di Slack non accetta markup: solo testo semplice.
        return { type: "header", text: { type: "plain_text", text: block.text, emoji: true } };
      case "section":
        return { type: "section", text: { type: "mrkdwn", text: block.text } };
      case "context":
        return { type: "context", elements: [{ type: "mrkdwn", text: block.text }] };
    }
  });

type SlackResponse = { readonly ok: boolean; readonly error?: string };

const isSlackResponse = (value: unknown): value is SlackResponse =>
  typeof value === "object" && value !== null && "ok" in value && typeof (value as SlackResponse).ok === "boolean";

export const make = (config: SlackConfig, transport: Http.Transport = Http.fetchTransport): NotificationPort => ({
  publish: (incident: Incident) =>
    pipe(
      Http.postJson(
        transport,
        `${config.baseUrl}/chat.postMessage`,
        Http.bearerAuth(config.botToken),
        config.timeoutMs,
        {
          channel: config.channel,
          // Il testo semplice è quello che compare nella notifica push e nell'anteprima: senza,
          // Slack mostra un messaggio vuoto sul telefono.
          text: IncidentMessage.summary(incident),
          blocks: toSlackBlocks(IncidentMessage.render(incident)),
        },
      ),
      TE.mapLeft((failure) => notifyFailed(Http.describe(failure))),
      TE.flatMap((body) =>
        !isSlackResponse(body)
          ? TE.left(notifyFailed("risposta Slack non conforme"))
          : body.ok
            ? TE.right(undefined)
            : TE.left(notifyFailed(body.error ?? "errore Slack senza motivo")),
      ),
    ),
});
