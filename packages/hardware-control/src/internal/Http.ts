// Il solo punto del package che parla HTTP. Travaso di `legacy/core/src/http.ts`, con una
// differenza: il trasporto è un parametro e non `fetch` globale — un adapter che apre socket veri
// non si mette alla prova, e l'ACL è esattamente il posto in cui la rete va tenuta a un braccio di
// distanza.
// `HttpFailure` è interno al package e non attraversa mai una porta: chi lo riceve lo traduce in
// `ProbeOutcome` o in `RemedyOutcome` (A-6, NO-10). Le sue varianti sono scelte per essere
// traducibili senza perdite — un timeout non è un 404, e a valle diventano esiti diversi.

import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type * as t from "io-ts";

export type Method = "GET" | "POST";

export type HttpRequest = {
  readonly url: string;
  readonly method: Method;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs: number;
};

export type HttpResponse = {
  readonly status: number;
  readonly body: string;
};

export type HttpFailure =
  // Il server non è stato raggiunto affatto: rete giù, DNS, connessione rifiutata.
  | { readonly _tag: "Unreachable"; readonly detail: string }
  // Raggiunto ma non ha risposto in tempo. Distinto da `Unreachable` perché a valle è la
  // differenza fra "il device è giù" e "il canale è lento" (FATTO-12).
  | { readonly _tag: "Timeout"; readonly afterMs: number }
  // Ha risposto, e la risposta è un rifiuto. Il `body` serve solo a scrivere una diagnosi.
  | { readonly _tag: "BadStatus"; readonly status: number; readonly body: string }
  // Ha risposto qualcosa che non è ciò che il contratto promette.
  | { readonly _tag: "Malformed"; readonly detail: string };

export const unreachable = (detail: string): HttpFailure => ({ _tag: "Unreachable", detail });

export const timeout = (afterMs: number): HttpFailure => ({ _tag: "Timeout", afterMs });

export const badStatus = (status: number, body: string): HttpFailure => ({ _tag: "BadStatus", status, body });

export const malformed = (detail: string): HttpFailure => ({ _tag: "Malformed", detail });

export const describe = (failure: HttpFailure): string => {
  switch (failure._tag) {
    case "Unreachable":
      return `host irraggiungibile: ${failure.detail}`;
    case "Timeout":
      return `nessuna risposta entro ${failure.afterMs}ms`;
    case "BadStatus":
      return `risposta ${failure.status}: ${failure.body.slice(0, 200)}`;
    case "Malformed":
      return `risposta non conforme: ${failure.detail}`;
  }
};

export type Transport = (request: HttpRequest) => TE.TaskEither<HttpFailure, HttpResponse>;

// L'unica implementazione che tocca davvero la rete. Il timeout è suo e non del chiamante: una
// `fetch` senza scadenza può restare appesa per sempre, ed è lo stesso difetto che FATTO-12
// descrive per adb.
export const fetchTransport: Transport = (request) =>
  TE.tryCatch(
    async () => {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { ...request.headers },
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      return { status: response.status, body: await response.text() };
    },
    (error): HttpFailure => {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return timeout(request.timeoutMs);
      return unreachable(error instanceof Error ? error.message : String(error));
    },
  );

export const basicAuth = (tokenId: string, tokenPassword: string): Record<string, string> => ({
  Authorization: `Basic ${btoa(`${tokenId}:${tokenPassword}`)}`,
  "Content-Type": "application/json",
});

export const bearerAuth = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

// Uno status fuori da 2xx è un fallimento, non un corpo da leggere: `BadStatus` porta con sé
// abbastanza per scriverne la diagnosi e nient'altro.
const ensureOk = (response: HttpResponse): E.Either<HttpFailure, string> =>
  response.status >= 200 && response.status < 300
    ? E.right(response.body)
    : E.left(badStatus(response.status, response.body));

const parseJson = (raw: string): E.Either<HttpFailure, unknown> =>
  E.tryCatch(
    () => JSON.parse(raw) as unknown,
    (error) => malformed(error instanceof Error ? error.message : String(error)),
  );

// Il confine dei tipi: da qui in giù è `unknown`, da qui in su è il codec (A-9, io-ts solo al
// confine). Il messaggio elenca i percorsi che non hanno decodificato, come in
// `legacy/core/src/validation.ts`, perché un "Invalid value" nudo non si diagnostica.
export const decode =
  <A>(codec: t.Decoder<unknown, A>) =>
  (raw: unknown): E.Either<HttpFailure, A> =>
    pipe(
      codec.decode(raw),
      E.mapLeft((errors: t.Errors) =>
        malformed(errors.map((error) => error.context.map(({ key }) => key).join(".")).join(", ")),
      ),
    );

export const send = (transport: Transport, request: HttpRequest): TE.TaskEither<HttpFailure, unknown> =>
  pipe(transport(request), TE.flatMapEither(ensureOk), TE.flatMapEither(parseJson));

export const getJson = (
  transport: Transport,
  url: string,
  headers: Readonly<Record<string, string>>,
  timeoutMs: number,
): TE.TaskEither<HttpFailure, unknown> => send(transport, { url, method: "GET", headers, timeoutMs });

export const postJson = (
  transport: Transport,
  url: string,
  headers: Readonly<Record<string, string>>,
  timeoutMs: number,
  body?: unknown,
): TE.TaskEither<HttpFailure, unknown> => send(transport, { url, method: "POST", headers, body, timeoutMs });
