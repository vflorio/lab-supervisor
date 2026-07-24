import * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import type { Endomorphism } from "fp-ts/Endomorphism";
import * as Equality from "fp-ts/Eq";
import { pipe } from "fp-ts/function";
import * as N from "fp-ts/number";
import * as S from "fp-ts/string";
import * as t from "io-ts";

// -------------------------------------------------------------------------------------
// IP
// -------------------------------------------------------------------------------------

export type IP = string & { readonly _brand: "IP" };

const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const isIP = (u: unknown): u is IP => typeof u === "string" && IP_REGEX.test(u);

export const IPCodec = new t.Type<IP, IP, unknown>(
  "IP",
  isIP,
  (u, c) => (isIP(u) ? t.success(u) : t.failure(u, c, "Expected an IPv4 address (e.g. 192.168.0.1)")),
  t.identity,
);

export const EqIP: Equality.Eq<IP> = S.Eq;

// -------------------------------------------------------------------------------------
// PORT
// -------------------------------------------------------------------------------------

export type PORT = number & { readonly _brand: "PORT" };

const isPort = (u: unknown): u is PORT => typeof u === "number" && Number.isInteger(u) && u > 0 && u <= 65535;

export const PortCodec = new t.Type<PORT, PORT, unknown>(
  "PORT",
  isPort,
  (u, c) => (isPort(u) ? t.success(u) : t.failure(u, c, "Expected a port number (1-65535)")),
  t.identity,
);

export const EqPort: Equality.Eq<PORT> = N.Eq;

// -------------------------------------------------------------------------------------
// Target = IP x PORT - validated "host:port" string <-> { ip, port } record
// -------------------------------------------------------------------------------------

export interface Endpoint {
  readonly ip: IP;
  readonly port: PORT;
}

const ENDPOINT_REGEX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/;

const isEndpoint = (u: unknown): u is Endpoint =>
  typeof u === "object" && u !== null && isIP((u as Endpoint).ip) && isPort((u as Endpoint).port);

export const Codec = new t.Type<Endpoint, string, unknown>(
  "Endpoint",
  isEndpoint,
  (u, c) => {
    const match = typeof u === "string" ? ENDPOINT_REGEX.exec(u) : null;
    return match
      ? t.success({ ip: match[1] as IP, port: Number(match[2]) as PORT })
      : t.failure(u, c, "Expected <ip>:<port> (e.g. 192.168.0.1:1234)");
  },
  (target) => `${target.ip}:${target.port}`,
);

export const decode = (s: string): E.Either<Validation.ValidationError, Endpoint> =>
  pipe(Codec.decode(s), E.mapLeft(Validation.createValidationError));

export const of = (ip: IP, port: PORT): Endpoint => ({ ip, port });

// String form: usarla ogni volta che serve un rappresentazione testuale esplicita
// (comandi shell, messaggi di log) - `Target` non è più una stringa, quindi la
// conversione implicita via template literal/string concat non funziona più.
export const format = (target: Endpoint): string => Codec.encode(target);

// Equality

export const Eq: Equality.Eq<Endpoint> = Equality.struct({ ip: EqIP, port: EqPort });
export const EqByIp: Equality.Eq<Endpoint> = Equality.contramap((target: Endpoint) => target.ip)(EqIP);

// Updates

export const withPort =
  (port: PORT): Endomorphism<Endpoint> =>
  (target) => ({ ...target, port });

export const withIp =
  (ip: IP): Endomorphism<Endpoint> =>
  (target) => ({ ...target, ip });
