import type * as Logger from "@supervisor/core/logger";
import * as NetworkTarget from "@supervisor/core/network-target";
import * as Retry from "@supervisor/core/retry/retry";
import * as Adb from "@supervisor/core/services/adb";
import type * as Shell from "@supervisor/core/shell";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type { ConnectionCommand, ConnectionEvent } from "./model";

// -------------------------------------------------------------------------------------
// Handler
// -------------------------------------------------------------------------------------

// Ogni comando cattura i propri fallimenti e li traduce in eventi (mai in un Left):
// la state machine è quindi auto-risanante, un device che fallisce la connessione
// torna semplicemente a Unknown senza far fallire l'intero ciclo di discovery.

export interface ConnectionEnv {
  readonly logger: Logger.Tagged;
  readonly adbPort: NetworkTarget.PORT;
  readonly adbReconnectPolicy: Retry.Policy;
  readonly spawn: Shell.Spawn;
}

const liftAdb =
  <A>(effect: RTE.ReaderTaskEither<Adb.AdbEnv, Adb.Error | Shell.ShellSpawnError, A>) =>
  (env: ConnectionEnv): TE.TaskEither<Adb.Error | Shell.ShellSpawnError, A> =>
    effect({ logger: env.logger.child("ADB"), spawn: env.spawn });

const reasonOf = (error: { readonly message: string }): string => error.message;

const toEvents = <A>(
  onLeft: (reason: string) => readonly ConnectionEvent[],
  onRight: (value: A) => readonly ConnectionEvent[],
): ((fa: TE.TaskEither<{ readonly message: string }, A>) => T.Task<readonly ConnectionEvent[]>) =>
  TE.match((error) => onLeft(reasonOf(error)), onRight);

export const handle =
  (command: ConnectionCommand): RTE.ReaderTaskEither<ConnectionEnv, never, readonly ConnectionEvent[]> =>
  (env) =>
    TE.fromTask(
      match(command)
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
              () => [{ _tag: "TcpipConfigured", persistentTarget: NetworkTarget.withPort(env.adbPort)(target) }],
            ),
          ),
        )
        .with({ _tag: "ConnectPersistent" }, ({ target }) =>
          pipe(
            T.delay(1000)(T.of(undefined)),
            T.flatMap(() => Retry.retrying(env.adbReconnectPolicy, env.logger)(liftAdb(Adb.connect(target))(env))),
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
                  `Failed to disconnect temporary connection for ${NetworkTarget.format(target)}: ${reason}`,
                )();
                return [];
              },
              () => [],
            ),
          ),
        )
        .exhaustive(),
    );
