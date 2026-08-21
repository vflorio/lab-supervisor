// `NotificationPort` quando Slack non è configurato — la modalità con cui si porta su il servizio
// in un lab nuovo senza inondare un canale vero, e quella con cui gira in locale.
// Non è un finto: consegna davvero l'incidente, su un canale più povero. Riusa `IncidentMessage`,
// che è già una forma neutra e si legge bene in un terminale (M-10), quindi ciò che si vede qui è
// esattamente ciò che sarebbe finito su Slack.

import { IncidentMessage } from "@lab/alerting";
import type { Incident } from "@lab/recovery/domain/Incident";
import type { NotificationPort } from "@lab/recovery/ports/NotificationPort";
import * as TE from "fp-ts/TaskEither";
import type { Logger } from "../Logger";

export const make = (logger: Logger): NotificationPort => ({
  publish: (incident: Incident) =>
    TE.fromIO(() => {
      logger.warn(IncidentMessage.summary(incident));
      for (const block of IncidentMessage.render(incident)) logger.info(`  ${block.text.replace(/\n/g, "\n  ")}`);
    }),
});
