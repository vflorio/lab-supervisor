import * as Network from "@supervisor/core/network";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
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

export type AndroidBridgeMachineEnv = AdbConnectionMachineEnv;

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

export const interpret = (
  intent: AndroidBridgeIntent,
): RTE.ReaderTaskEither<AndroidBridgeMachineEnv, never, readonly AndroidBridgeEvent[]> =>
  match(intent)
    .with({ _tag: "Connect" }, ({ host }) => pipe(TargetResolution.connect(host), RTE.map(toEvents(host))))
    .exhaustive();
