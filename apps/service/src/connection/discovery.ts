import * as Errors from "@supervisor/core/errors";
import * as Logger from "@supervisor/core/logger";
import * as Network from "@supervisor/core/network";
import * as Adb from "@supervisor/core/services/adb";
import * as AvahiBrowse from "@supervisor/core/services/avahi-browse";
import type * as Shell from "@supervisor/core/shell";
import { pipe } from "fp-ts/function";
import type * as P from "fp-ts/Predicate";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import type { AdbConnectionEnv } from "./adb-connection/interpret";
import * as AdbConnectionMachine from "./adb-connection/machine";
import * as AdbConnection from "./adb-connection/model";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Env extends AdbConnectionEnv {
  // Determina se un determinato IP è noto al registry (controllato o meno)
  // un device completamente esterno al registry non va toccato, viene solo ignorato
  readonly isControlled: P.Predicate<Network.Endpoint>;
  // Determina se un determinato IP è marcato come controllabile dal DB
  readonly isKnown: P.Predicate<Network.Endpoint>;
}

export type DiscoveryError = Adb.Error | AvahiBrowse.AvahiBrowseError | Shell.ShellSpawnError;

// -------------------------------------------------------------------------------------
// Internal
// -------------------------------------------------------------------------------------

type Effect<A> = RTE.ReaderTaskEither<Env, DiscoveryError, A>;

const logDebug =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.debug(message));

const logInfo =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.info(message));

const logError =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.error(message));

const liftMdns =
  <A>(
    effect: RTE.ReaderTaskEither<AvahiBrowse.AvahiBrowseEnv, AvahiBrowse.AvahiBrowseError | Shell.ShellSpawnError, A>,
  ): Effect<A> =>
  (env) =>
    effect({ logger: env.logger.child("mDNS"), spawn: env.spawn });

const getConnectedAdbDevices: Effect<readonly Network.Endpoint[]> = (env) =>
  pipe(
    Adb.devices({ logger: env.logger.child("ADB"), spawn: env.spawn }),
    TE.map((devices) => devices.filter((d) => d.status === "device").map((d) => d.target)),
  );

const filterControlledOnly =
  (devices: readonly Network.Endpoint[]): Effect<readonly Network.Endpoint[]> =>
  ({ isControlled }) =>
    TE.right(devices.filter(isControlled));

// Noti al registry ma non (più) controllati: vanno disconnessi. Un device sconosciuto al
// registry viene invece ignorato (potrebbe essere un device esterno, non nostro).
const filterKnownButUncontrolled =
  (devices: readonly Network.Endpoint[]): Effect<readonly Network.Endpoint[]> =>
  ({ isControlled, isKnown }) =>
    TE.right(devices.filter((target) => isKnown(target) && !isControlled(target)));

// Best-effort: un fallimento in disconnessione non deve far fallire l'intero ciclo di discovery,
// si logga soltanto (verrà ritentato al prossimo ciclo).
const disconnectStray =
  (target: Network.Endpoint): Effect<void> =>
  (env) =>
    pipe(
      Adb.disconnect(target)({ logger: env.logger.child("ADB"), spawn: env.spawn }),
      TE.orElse((error) => {
        env.logger.error(`Failed to disconnect uncontrolled host ${Network.format(target)}: ${Errors.format(error)}`)();
        return TE.right<Adb.Error, void>(undefined);
      }),
    );

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

// Applica un singolo device (già scoperto via mDNS) alla Target Machine, partendo da
// Unknown, e ne ritorna lo stato finale:
//  - Persistent se la connessione ha avuto successo
//  - Unknown se ha fallito
export const connect = (target: Network.Endpoint): Effect<AdbConnection.TargetState> =>
  AdbConnectionMachine.dispatch(AdbConnection.unknown(target.ip), { _tag: "TargetDiscovered", target });

export const discoverAndConnect: Effect<readonly Network.Endpoint[]> = pipe(
  logInfo("Starting mDNS discovery"),

  RTE.bind("allConnected", () => getConnectedAdbDevices),

  // Stato iniziale: un host noto al registry ma non controllato viene disconnesso subito -
  // un host sconosciuto al registry (device completamente esterno) viene invece ignorato.
  RTE.bind("stray", ({ allConnected }) => filterKnownButUncontrolled(allConnected)),
  RTE.tap(({ stray }) =>
    stray.length > 0
      ? logInfo(`Disconnecting known-but-uncontrolled hosts: ${stray.map((target) => target.ip).join(", ")}`)
      : logInfo("No known-but-uncontrolled hosts to disconnect"),
  ),
  RTE.tap(({ stray }) => RTE.sequenceSeqArray(stray.map(disconnectStray))),

  RTE.bind("connected", ({ allConnected }) => filterControlledOnly(allConnected)),
  RTE.tap(({ connected }) =>
    connected.length > 0
      ? logInfo(`Already connected hosts: ${connected.map((target) => target.ip).join(", ")}`)
      : logInfo("No already connected hosts"),
  ),

  RTE.bind("discovered", () =>
    pipe(
      liftMdns(AvahiBrowse.discoverAdbTlsConnect),
      RTE.flatMap(filterControlledOnly),
      RTE.tapError((error) => logError(`mDNS discovery failed: ${Errors.format(error)}`)),
    ),
  ),

  RTE.bind("newTargets", ({ connected, discovered }) => RTE.of(RA.difference(Network.EqByIp)(connected)(discovered))),
  RTE.tap(({ newTargets }) =>
    newTargets.length > 0
      ? logInfo(`New targets to connect: ${JSON.stringify(newTargets)}`)
      : logInfo("No new targets to connect"),
  ),

  // Processiamo i devices in modo sequenziale (1 a 1)
  RTE.bind("resolved", ({ newTargets }) => RTE.sequenceSeqArray(newTargets.map(connect))),

  RTE.tap(() => logInfo("Discovery complete")),
  RTE.tap(({ resolved }) => logDebug(Logger.formatJsonLog([{ resolved }]))),

  RTE.map(({ connected, resolved }) => [
    ...connected,
    ...resolved.filter(AdbConnection.isPersistent).map((s) => s.target),
  ]),
);
