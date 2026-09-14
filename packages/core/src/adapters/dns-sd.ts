import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import * as TE from "fp-ts/TaskEither";
import type * as Logger from "../logger/logger";
import * as Network from "../network";
import * as Shell from "../shell";

export interface DnsSdEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
}

export type DnsSdError = Shell.ShellSpawnError;

type Effect<A> = RTE.ReaderTaskEither<DnsSdEnv, DnsSdError, A>;

// A differenza di `avahi-browse -t` (che termina appena svuota la cache), `dns-sd` resta in
// ascolto all'infinito: ogni fase gira quindi per una finestra fissa e poi viene terminata.
// La discovery richiede due passate perché nessun singolo comando `dns-sd` fornisce IP + porta:
//   1) `-Z` (browse + resolve) -> record SRV con hostname `.local` + porta
//   2) `-G v4 <hostname>` -> record A con l'IP corrente dell'hostname
const BROWSE_WINDOW_MS = 2000;
const RESOLVE_WINDOW_MS = 1000;

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// Gli hostname arrivano dalla rete (non fidati) e vengono interpolati in `sh -c`: whitelist
// rigida per escludere ogni metacarattere di shell (command injection).
const SAFE_HOST = /^[A-Za-z0-9._-]+$/;

interface Service {
  readonly host: string;
  readonly port: Network.PORT;
}

// Avvolge un'invocazione `dns-sd` (che non termina mai) in uno shell one-liner che la killa
// dopo `windowMs` uscendo con codice 0: riproduce la semantica "termina da solo" di avahi-browse,
// così il normale `spawn` restituisce stdout senza trattare la terminazione come errore.
const timed = (args: readonly string[], windowMs: number): readonly [string, readonly string[]] => [
  "sh",
  ["-c", `dns-sd ${args.join(" ")} & p=$!; sleep ${Math.ceil(windowMs / 1000)}; kill $p 2>/dev/null; exit 0`],
];

const run = (args: readonly string[], windowMs: number, env: DnsSdEnv): TE.TaskEither<DnsSdError, string> => {
  const [command, commandArgs] = timed(args, windowMs);
  return Shell.run(command, commandArgs, windowMs + 3000)({ spawn: env.spawn, logger: env.logger });
};

// Output `-Z` (zone file): le righe SRV hanno la forma
//   <istanza>  SRV  <prio> <weight> <porta> <hostname>.
const parseServices = (stdout: string): Service[] => {
  const services: Service[] = [];

  for (const line of stdout.split("\n")) {
    const tokens = line.trim().split(/\s+/);
    const srv = tokens.indexOf("SRV");
    if (srv < 0 || tokens.length < srv + 5) continue;

    const port = Number(tokens[srv + 3]);
    const host = tokens[srv + 4]?.replace(/\.$/, "");
    if (!host || !SAFE_HOST.test(host)) continue;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;

    services.push({ host, port: port as Network.PORT });
  }

  return services;
};

// Output `-G v4`: le righe di aggiunta hanno la forma
//   <timestamp>  Add  <flags>  <if>  <hostname>.  <ipv4>  <ttl>
const parseAddress = (stdout: string): O.Option<Network.IP> => {
  for (const line of stdout.split("\n")) {
    const tokens = line.trim().split(/\s+/);
    if (tokens[1] !== "Add") continue;

    const ip = tokens.slice(4).find((token) => IPV4.test(token));
    if (ip) return O.some(ip as Network.IP);
  }

  return O.none;
};

const resolveHost =
  (env: DnsSdEnv) =>
  (host: string): TE.TaskEither<DnsSdError, O.Option<readonly [string, Network.IP]>> =>
    pipe(
      run(["-G", "v4", host], RESOLVE_WINDOW_MS, env),
      TE.map(parseAddress),
      TE.map(O.map((ip) => [host, ip] as const)),
    );

// Ricompone i servizi (host + porta) con gli IP risolti, scartando gli host non risolti e i
// duplicati - stesso principio di dedup di avahi-browse (per `ip:port`).
const toEndpoints =
  (services: readonly Service[]) =>
  (resolved: readonly O.Option<readonly [string, Network.IP]>[]): Network.Endpoint[] => {
    const ipByHost = new Map<string, Network.IP>();
    for (const entry of resolved) if (O.isSome(entry)) ipByHost.set(entry.value[0], entry.value[1]);

    const seen = new Set<string>();
    const endpoints: Network.Endpoint[] = [];
    for (const service of services) {
      const ip = ipByHost.get(service.host);
      if (!ip) continue;

      const key = `${ip}:${service.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      endpoints.push(Network.of(ip, service.port));
    }

    return endpoints;
  };

const discover =
  (serviceType: string): Effect<Network.Endpoint[]> =>
  (env) =>
    pipe(
      run(["-Z", serviceType, "local"], BROWSE_WINDOW_MS, env),
      TE.map(parseServices),
      TE.chain((services) =>
        pipe(
          services,
          RA.map((service) => service.host),
          RA.uniq(S.Eq),
          TE.traverseArray(resolveHost(env)),
          TE.map(toEndpoints(services)),
        ),
      ),
    );

export const discoverAdbTlsConnect: Effect<Network.Endpoint[]> = discover("_adb-tls-connect._tcp");
export const discoverAdbTlsPairing: Effect<Network.Endpoint[]> = discover("_adb-tls-pairing._tcp");
