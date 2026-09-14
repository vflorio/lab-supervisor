import type * as RTE from "fp-ts/ReaderTaskEither";
import type * as Logger from "../logger/logger";
import type * as Network from "../network";
import type * as Shell from "../shell";
import * as AvahiBrowse from "./avahi-browse";
import * as DnsSd from "./dns-sd";

// Facciata sulla mDNS discovery: il chiamante sceglie il backend, l'implementazione (quale
// binario e quale parsing) resta un dettaglio nascosto. avahi-browse su Linux, dns-sd su macOS.
export type Backend = "avahi" | "dns-sd";

export interface MdnsEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
  readonly backend: Backend;
}

export type MdnsError = AvahiBrowse.AvahiBrowseError | DnsSd.DnsSdError;

type Effect<A> = RTE.ReaderTaskEither<MdnsEnv, MdnsError, A>;

export const discoverAdbTlsConnect: Effect<Network.Endpoint[]> = (env) =>
  env.backend === "dns-sd" ? DnsSd.discoverAdbTlsConnect(env) : AvahiBrowse.discoverAdbTlsConnect(env);

export const discoverAdbTlsPairing: Effect<Network.Endpoint[]> = (env) =>
  env.backend === "dns-sd" ? DnsSd.discoverAdbTlsPairing(env) : AvahiBrowse.discoverAdbTlsPairing(env);
