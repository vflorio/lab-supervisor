import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type * as Logger from "../logger/logger";
import * as Network from "../network";
import * as Shell from "../shell";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface AvahiBrowseEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
}

export type AvahiBrowseError =
  | Shell.ShellSpawnError
  | {
      readonly type: "AvahiBrowseError";
      readonly message: string;
    };

type Effect<A> = RTE.ReaderTaskEither<AvahiBrowseEnv, AvahiBrowseError | Shell.ShellSpawnError, A>;

// -------------------------------------------------------------------------------------
// Parser - avahi-browse -prt output
// -------------------------------------------------------------------------------------
// Resolved lines (=) have the format:
//   =;iface;protocol;name;type;domain;hostname;address;port;txt
//
// We extract address (field 7) and port (field 8).

const parse = (stdout: string): Network.Endpoint[] => {
  const seen = new Set<string>();
  const endpoints: Network.Endpoint[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.startsWith("=")) continue;
    const fields = line.split(";");
    if (fields.length < 9) continue;

    const ip = fields[7];
    const port = Number(fields[8]);
    if (!ip || Number.isNaN(port)) continue;

    const key = `${ip}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push(Network.of(ip as Network.IP, port as Network.PORT));
  }

  return endpoints;
};

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

export const discover =
  (command: string, args: readonly string[]): Effect<Network.Endpoint[]> =>
  (env) =>
    pipe(Shell.run(command, args)({ spawn: env.spawn, logger: env.logger }), TE.map(parse));

export const discoverAdbTlsConnect: Effect<Network.Endpoint[]> = discover("avahi-browse", [
  "-prt",
  "_adb-tls-connect._tcp",
]);
export const discoverAdbTlsPairing: Effect<Network.Endpoint[]> = discover("avahi-browse", [
  "-prt",
  "_adb-tls-pairing._tcp",
]);
