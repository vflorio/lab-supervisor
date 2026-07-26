import type * as Activity from "@supervisor/core/activity/stream";
import * as Network from "@supervisor/core/network";
import * as Retry from "@supervisor/core/retry/retry";
import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type { AdbConnectionMachineEnv } from "../adb-connection/interpret";
import * as AdbConnection from "../adb-connection/model";
import * as TargetResolution from "../target-resolution";
import type { AndroidBridgeEvent, AndroidBridgeIntent } from "./model";

// -------------------------------------------------------------------------------------
// Interpret
// -------------------------------------------------------------------------------------
//
// Un solo intent: Connect delega a TargetResolution.connect, che già gestisce risoluzione
// mDNS + adb-connection (Unknown -> Temporary -> Persistent) ed è "self-healing"
// (non fallisce mai: un lookup/handshake fallito torna semplicemente Unknown).
// Leggiamo il risultato con AdbConnection.isPersistent per decidere
// se la connessione applicativa è stabilita.
// -------------------------------------------------------------------------------------

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

// Ritenta l'intero tentativo (risoluzione mDNS + handshake temporaneo + tcpip + handshake
// persistente - non solo la fase tcpip:5555, già ritentata internamente da adb-connection/
// interpret.ts per la sua unica ConnectPersistent) finché non si ottiene Persistent, con la
// stessa policy usata per la riconnessione. TargetResolution.connect non fallisce mai (Err =
// never): un tentativo esaurito ritorna comunque l'ultimo ConnectionState raggiunto (Unknown),
// da cui deriviamo ConnectionFailed - mai un errore.
const interpretWithPolicy =
  (policy: Retry.Policy) =>
  (intent: AndroidBridgeIntent): RTE.ReaderTaskEither<AndroidBridgeMachineEnv, never, readonly AndroidBridgeEvent[]> =>
  (env) =>
    match(intent)
      .with({ _tag: "Connect" }, ({ host }) =>
        pipe(
          TargetResolution.connect(host)(env),
          Retry.retryingWhile(policy, env.logger)(AdbConnection.isPersistent),
          TE.map(toEvents(host)),
        ),
      )
      .exhaustive();

export const interpret =
  (intent: AndroidBridgeIntent): RTE.ReaderTaskEither<AndroidBridgeMachineEnv, never, readonly AndroidBridgeEvent[]> =>
  (env) =>
    interpretWithPolicy(env.adbReconnectPolicy)(intent)(env);
