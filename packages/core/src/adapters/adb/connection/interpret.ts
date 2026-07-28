import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import * as Retry from "@supervisor/core/retry/retry";
import type * as Shell from "@supervisor/core/shell";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import * as Adb from "../shell";
import type { ConnectionEvent, ConnectionIntent } from "./model";

// Ogni intento cattura i propri fallimenti e li traduce in eventi: la state machine è quindi
// auto-risanante, un device che fallisce la connessione torna semplicemente a Unknown senza
// far fallire l'intero ciclo di discovery.

export interface AdbConnectionMachineEnv {
  readonly logger: Logger.Tagged;
  readonly adbPort: Network.PORT;
  readonly spawn: Shell.Spawn;
}

// Quantum di tentativi per il solo handshake ADB (`adb connect`) - non configurabile: dettaglio
// meccanico del protocollo, non una decisione operativa (a differenza di adb.waitForDeviceTimeout,
// la pazienza di un workflow). Valori bassi di proposito: un quantum esaurito si traduce solo in
// "richiediamone un altro al prossimo reconcile tick", non in una resa definitiva.
export const ADB_CONNECT_RETRY_POLICY: Retry.Policy = pipe(
  Retry.constantDelay(400),
  Retry.concat(Retry.exponentialBackoff(800)),
  Retry.capDelay(30_000),
  Retry.concat(Retry.limitRetries(5)),
);

const liftAdb =
  <A>(effect: RTE.ReaderTaskEither<Adb.AdbEnv, Adb.Error | Shell.ShellSpawnError, A>) =>
  (env: AdbConnectionMachineEnv): TE.TaskEither<Adb.Error | Shell.ShellSpawnError, A> =>
    effect({ logger: env.logger.child("ADB"), spawn: env.spawn });

const reasonOf = (error: { readonly message: string }): string => error.message;

const toEvents = <A>(
  onLeft: (reason: string) => readonly ConnectionEvent[],
  onRight: (value: A) => readonly ConnectionEvent[],
): ((fa: TE.TaskEither<{ readonly message: string }, A>) => T.Task<readonly ConnectionEvent[]>) =>
  TE.match((error) => onLeft(reasonOf(error)), onRight);

export const interpret =
  (intent: ConnectionIntent): RTE.ReaderTaskEither<AdbConnectionMachineEnv, never, readonly ConnectionEvent[]> =>
  (env) =>
    TE.fromTask(
      match(intent)
        .with({ _tag: "ConnectTemporary" }, ({ target }) =>
          pipe(
            liftAdb(Adb.connect(target))(env),
            toEvents(
              (reason) => [{ _tag: "TemporaryHandshakeFailed", reason }],
              () => [{ _tag: "TemporaryHandshakeOk", target }],
            ),
          ),
        )
        .with({ _tag: "ConfigurePersistentPort" }, ({ target }) =>
          pipe(
            liftAdb(Adb.tcpip(env.adbPort)(target))(env),
            toEvents(
              (reason) => [{ _tag: "PersistentHandshakeFailed", reason }],
              () => [{ _tag: "TcpipConfigured", persistentTarget: Network.withPort(env.adbPort)(target) }],
            ),
          ),
        )
        .with({ _tag: "ConnectPersistent" }, ({ target }) =>
          pipe(
            T.delay(1000)(T.of(undefined)),
            T.flatMap(() => Retry.retrying(ADB_CONNECT_RETRY_POLICY, env.logger)(liftAdb(Adb.connect(target))(env))),
            T.flatMap(
              E.match(
                (reason): T.Task<readonly ConnectionEvent[]> =>
                  T.of([{ _tag: "PersistentHandshakeFailed", reason: reasonOf(reason) }]),
                (): T.Task<readonly ConnectionEvent[]> => T.of([{ _tag: "PersistentHandshakeOk", target }]),
              ),
            ),
          ),
        )
        .with({ _tag: "DisconnectTemporary" }, ({ target }) =>
          pipe(
            liftAdb(Adb.disconnect(target))(env),
            toEvents(
              // Best-effort cleanup: il device è già Persistent, un fallimento qui non
              // deve farlo tornare Unknown - si logga soltanto.
              (reason) => {
                env.logger.error(
                  `Failed to disconnect temporary connection for ${Network.format(target)}: ${reason}`,
                )();
                return [];
              },
              () => [],
            ),
          ),
        )
        .exhaustive(),
    );
