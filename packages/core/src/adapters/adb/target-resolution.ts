import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import type * as Shell from "@supervisor/core/shell";
import * as Machine from "@supervisor/core/state-machine/machine";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import * as AvahiBrowse from "../avahi-browse";
import type { AdbConnectionMachineEnv } from "./connection/interpret";
import * as AdbConnectionMachine from "./connection/machine";
import * as AdbConnection from "./connection/model";

// =========================================================================================
// MACHINE: TargetResolution
// =========================================================================================
//
// STATES     Searching{host}   Resolved{target}   NotFound{host, reason}
//
// EVENTS     ResolutionRequested   PortResolved   PortNotFound
//
// COMMANDS   LookupPort
//
// -----------------------------------------------------------------------------------------
//     [*] --> Searching
//
//     Searching --> Searching : ResolutionRequested / LookupPort
//     Searching --> Resolved  : PortResolved
//     Searching --> NotFound  : PortNotFound
// -----------------------------------------------------------------------------------------
// TRANSITIONS  <FROM> -> <EVENT> -> <TO> [/ <COMMAND>]     (definite nel reducer)
//
//   Searching -> ResolutionRequested -> Searching / LookupPort
//   Searching -> PortResolved        -> Resolved
//   Searching -> PortNotFound        -> NotFound
//
// =========================================================================================

// Risolve un Host (solo IP, porta ignota) nell'Endpoint attualmente pubblicato via mDNS.
// Layer trasparente sopra la Target Machine: un Host risolto viene inoltrato come
// TargetDiscovered, uno non trovato non tenta alcuna connessione.

export type ResolutionState =
  | { readonly _tag: "Searching"; readonly host: Network.Host }
  | { readonly _tag: "Resolved"; readonly target: Network.Endpoint }
  | { readonly _tag: "NotFound"; readonly host: Network.Host; readonly reason: string };

export const searching = (host: Network.Host): ResolutionState => ({ _tag: "Searching", host });
export const resolved = (target: Network.Endpoint): ResolutionState => ({ _tag: "Resolved", target });
export const notFound = (host: Network.Host, reason: string): ResolutionState => ({ _tag: "NotFound", host, reason });

export type ResolutionEvent =
  | { readonly _tag: "ResolutionRequested"; readonly host: Network.Host }
  | { readonly _tag: "PortResolved"; readonly target: Network.Endpoint }
  | { readonly _tag: "PortNotFound"; readonly host: Network.Host; readonly reason: string };

export type ResolutionIntent = { readonly _tag: "LookupPort"; readonly host: Network.Host };

// Stesso principio della Target Machine: le combinazioni (stato, evento) non previste sono
// ignorate (self-loop senza comandi) - un evento fuori sequenza non deve avere effetto.

export const reduce: Machine.Reducer<ResolutionState, ResolutionEvent, ResolutionIntent> = (state, event) =>
  match<[ResolutionState, ResolutionEvent], Machine.Transition<ResolutionState, ResolutionIntent>>([state, event])
    .with([{ _tag: "Searching" }, { _tag: "ResolutionRequested" }], ([, e]) =>
      Machine.transition(searching(e.host), [{ _tag: "LookupPort", host: e.host }]),
    )
    .with([{ _tag: "Searching" }, { _tag: "PortResolved" }], ([, e]) => Machine.transition(resolved(e.target)))
    .with([{ _tag: "Searching" }, { _tag: "PortNotFound" }], ([, e]) => Machine.transition(notFound(e.host, e.reason)))

    .otherwise(() => Machine.transition(state));

// Stesso principio della Target Machine: logga solo quando cambia la "fase" (`_tag`).

const describeState = (state: ResolutionState): string =>
  match(state)
    .with({ _tag: "Searching" }, (s) => `Searching(${Network.formatHost(s.host)})`)
    .with({ _tag: "Resolved" }, (s) => `Resolved(${Network.format(s.target)})`)
    .with({ _tag: "NotFound" }, (s) => `NotFound(${Network.formatHost(s.host)})`)
    .exhaustive();

const describeEvent = (event: ResolutionEvent): string =>
  match(event)
    .with({ _tag: "ResolutionRequested" }, (e) => `ResolutionRequested(${Network.formatHost(e.host)})`)
    .with({ _tag: "PortResolved" }, (e) => `PortResolved(${Network.format(e.target)})`)
    .with({ _tag: "PortNotFound" }, (e) => `PortNotFound(${e.reason})`)
    .exhaustive();

// Non trovare la porta non è una regressione (è l'esito atteso per un device offline),
// va comunque segnalato ma senza il livello "error" della Target Machine.
const onTransition: Machine.TransitionHook<TargetResolutionMachineEnv, never, ResolutionState, ResolutionEvent> =
  (from, event, to) => (env) =>
    from._tag === to._tag
      ? TE.right(undefined)
      : TE.fromIO(
          (to._tag === "NotFound" ? env.logger.child("Resolution").warn : env.logger.child("Resolution").info)(
            `State Machine\n  -> Event = [${describeEvent(event)}]\n  -> Transition = [${describeState(from)} -> ${describeState(to)}]`,
          ),
        );

// Come la Target Machine, l'intento cattura i propri fallimenti (mDNS irraggiungibile, host
// non più pubblicato) e li traduce in eventi: un lookup fallito non deve far fallire l'intero
// ciclo, il risultato resta NotFound.

export interface TargetResolutionMachineEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
}

const reasonOf = (error: { readonly message: string }): string => error.message;

export const interpret =
  (intent: ResolutionIntent): RTE.ReaderTaskEither<TargetResolutionMachineEnv, never, readonly ResolutionEvent[]> =>
  (env) =>
    TE.fromTask(
      match(intent)
        .with({ _tag: "LookupPort" }, ({ host }) =>
          pipe(
            AvahiBrowse.discoverAdbTlsConnect({ logger: env.logger.child("mDNS"), spawn: env.spawn }),
            TE.map(RA.findFirst((target: Network.Endpoint) => Network.EqIP.equals(target.ip, host.ip))),
            TE.match(
              (error): readonly ResolutionEvent[] => [{ _tag: "PortNotFound", host, reason: reasonOf(error) }],
              O.match(
                (): readonly ResolutionEvent[] => [
                  { _tag: "PortNotFound", host, reason: `No mDNS record for ${Network.formatHost(host)}` },
                ],
                (target): readonly ResolutionEvent[] => [{ _tag: "PortResolved", target }],
              ),
            ),
          ),
        )
        .exhaustive(),
    );

const machine: Machine.Machine<TargetResolutionMachineEnv, never, ResolutionState, ResolutionEvent, ResolutionIntent> =
  Machine.make(reduce, interpret, onTransition);

export const dispatch = Machine.dispatch(machine);

type Effect<A> = RTE.ReaderTaskEither<AdbConnectionMachineEnv, never, A>;

// Host (porta ignota): risolve la porta corrente via mDNS, poi inoltra alla Target Machine.
// Nessuna porta trovata -> resta Unknown, nessuna connessione viene tentata (stesso principio
// "auto-risanante" della Target Machine: un lookup fallito non deve far fallire il chiamante).
export const connect = (host: Network.Host): Effect<AdbConnection.ConnectionState> =>
  pipe(
    dispatch(searching(host), { _tag: "ResolutionRequested", host }),
    RTE.flatMap((resolution) =>
      match(resolution)
        .with({ _tag: "Resolved" }, ({ target }): Effect<AdbConnection.ConnectionState> => connectKnown(target))
        .otherwise(({ host }): Effect<AdbConnection.ConnectionState> => RTE.right(AdbConnection.unknown(host.ip))),
    ),
  );

// Endpoint (porta esplicita, già nota/fresca - es. da uno scan mDNS bulk appena fatto):
// bypassa la risoluzione e va diretto alla Target Machine.
export const connectKnown = (target: Network.Endpoint): Effect<AdbConnection.ConnectionState> =>
  AdbConnectionMachine.dispatch(AdbConnection.unknown(target.ip), { _tag: "TargetDiscovered", target });
