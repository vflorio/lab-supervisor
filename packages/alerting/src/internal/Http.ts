// Il solo punto del package che parla HTTP. Travaso della parte di `legacy/core/src/http.ts` che
// serve a Slack — una POST con bearer token — e nient'altro.
// È un gemello ridotto di `hardware-control/src/internal/Http.ts`, e la duplicazione è voluta: la
// context map È il grafo delle dipendenze fra i package (A-1), e un package tecnico condiviso da
// tutti ci aggiungerebbe un nodo che non è un bounded context, per risparmiare sessanta righe.
// `HttpFailure` non attraversa la porta: chi lo riceve lo traduce in `NotifyFailed`.

import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";

export type HttpRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly timeoutMs: number;
};

export type HttpResponse = { readonly status: number; readonly body: string };

export type HttpFailure =
  | { readonly _tag: "Unreachable"; readonly detail: string }
  | { readonly _tag: "Timeout"; readonly afterMs: number }
  | { readonly _tag: "BadStatus"; readonly status: number; readonly body: string }
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

// Il timeout è suo e non del chiamante: una notifica appesa terrebbe fermo il tick che l'ha
// prodotta, e un incidente non consegnato è comunque preferibile a un supervisore fermo (INV-10).
export const fetchTransport: Transport = (request) =>
  TE.tryCatch(
    async () => {
      const response = await fetch(request.url, {
        method: "POST",
        headers: { ...request.headers },
        body: JSON.stringify(request.body),
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

export const bearerAuth = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json; charset=utf-8",
});

const ensureOk = (response: HttpResponse): E.Either<HttpFailure, string> =>
  response.status >= 200 && response.status < 300
    ? E.right(response.body)
    : E.left(badStatus(response.status, response.body));

const parseJson = (raw: string): E.Either<HttpFailure, unknown> =>
  E.tryCatch(
    () => JSON.parse(raw) as unknown,
    (error) => malformed(error instanceof Error ? error.message : String(error)),
  );

export const postJson = (
  transport: Transport,
  url: string,
  headers: Readonly<Record<string, string>>,
  timeoutMs: number,
  body: unknown,
): TE.TaskEither<HttpFailure, unknown> =>
  pipe(transport({ url, headers, body, timeoutMs }), TE.flatMapEither(ensureOk), TE.flatMapEither(parseJson));
