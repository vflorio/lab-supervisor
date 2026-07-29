import type * as Activity from "@supervisor/core/activity/stream";
import * as Network from "@supervisor/core/network";
import * as Retry from "@supervisor/core/retry/retry";
import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { ADB_CONNECT_RETRY_POLICY, type AdbConnectionMachineEnv } from "../adapters/adb/connection/interpret";
import * as AdbConnection from "../adapters/adb/connection/model";
import * as Adb from "../adapters/adb/shell";
import * as TargetResolution from "../adapters/adb/target-resolution";
import type { AndroidBridgeEvent, AndroidBridgeIntent } from "./model";

// Due intent, entrambi Err = never (un fallimento è sempre un evento, mai un Left):
//  - Connect delega a TargetResolution.connect, self-healing (Unknown -> Temporary ->
//    Persistent, non fallisce mai); isPersistent decide se la connessione è stabilita.
//  - Disconnect ripulisce il transport locale ed emette comunque ConnectionLost: che il
//    comando riesca o no, la camera non va più considerata connessa.

export type AndroidBridgeMachineEnv = AdbConnectionMachineEnv & { readonly activityStream: Activity.ActivityStream };

const toEvents =
  (host: Network.Host) =>
  (state: AdbConnection.ConnectionState): readonly AndroidBridgeEvent[] =>
    AdbConnection.isPersistent(state)
      ? [{ _tag: "ConnectionEstablished", target: state.target }]
      : [
          {
            _tag: "ConnectionFailed",
            reason: `Unable to establish persistent connection to ${Network.formatHost(host)}`,
          },
        ];

// Ritenta l'intero tentativo (mDNS + handshake temporaneo + tcpip + handshake persistente)
// finché non si ottiene Persistent, con la stessa policy del singolo handshake.
// TargetResolution.connect non fallisce mai: un tentativo esaurito ritorna l'ultimo
// ConnectionState raggiunto (Unknown), da cui deriviamo ConnectionFailed - mai un errore.
export const interpret =
  (intent: AndroidBridgeIntent): RTE.ReaderTaskEither<AndroidBridgeMachineEnv, never, readonly AndroidBridgeEvent[]> =>
  (env) =>
    match(intent)
      .with({ _tag: "Connect" }, ({ host }) =>
        pipe(
          TargetResolution.connect(host)(env),
          Retry.retryingWhile(ADB_CONNECT_RETRY_POLICY, env.logger)(AdbConnection.isPersistent),
          TE.map(toEvents(host)),
        ),
      )
      .with({ _tag: "Disconnect" }, ({ target, reason }) =>
        pipe(
          Adb.disconnectQuietly(target)({ logger: env.logger.child("ADB"), spawn: env.spawn }),
          TE.map((): readonly AndroidBridgeEvent[] => [{ _tag: "ConnectionLost", reason }]),
        ),
      )
      .exhaustive();
