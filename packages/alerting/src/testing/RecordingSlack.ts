// Slack finto: un trasporto che accetta le POST e conserva i corpi ricevuti. Serve a leggere il
// messaggio che sarebbe partito — che è l'unica cosa che di questo adapter interessi davvero — e a
// montare il supervisore in locale senza inondare un canale vero.

import * as TE from "fp-ts/TaskEither";
import type * as Http from "../internal/Http";

export type Posted = { readonly url: string; readonly body: unknown };

export interface RecordingSlack {
  readonly transport: Http.Transport;
  readonly posted: () => ReadonlyArray<Posted>;
  // Fa fallire il canale. `{ ok: false, error }` è il modo in cui Slack rifiuta *con* un 200: il
  // difetto classico di questa API, e va messo alla prova come un guasto qualsiasi.
  readonly failWith: (failure: Http.HttpFailure | undefined) => void;
  readonly rejectWith: (error: string | undefined) => void;
}

export const make = (): RecordingSlack => {
  const messages: Posted[] = [];
  let failure: Http.HttpFailure | undefined;
  let rejection: string | undefined;

  return {
    transport: (request) =>
      TE.flatten(
        TE.fromIO(() => {
          if (failure !== undefined) return TE.left(failure);
          messages.push({ url: request.url, body: request.body });
          return TE.right<Http.HttpFailure, Http.HttpResponse>({
            status: 200,
            body: JSON.stringify(rejection === undefined ? { ok: true } : { ok: false, error: rejection }),
          });
        }),
      ),
    posted: () => [...messages],
    failWith: (next) => {
      failure = next;
    },
    rejectWith: (error) => {
      rejection = error;
    },
  };
};
