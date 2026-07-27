import * as Network from "@supervisor/core/network";
import * as Machine from "@supervisor/core/state-machine/machine";
import { match } from "ts-pattern";
import {
  type AndroidBridgeEvent,
  type AndroidBridgeIntent,
  type AndroidBridgeState,
  connecting,
  disconnected,
  idle,
} from "./model";

// -------------------------------------------------------------------------------------
// Reducer
// -------------------------------------------------------------------------------------

// Proiezione Target -> Host richiesta per il retry da Idle a Disconnected: lo stato Idle
// possiede solo il Target (Endpoint ADB persistente), non l'Host originario da ririsolvere
// via mDNS - lo si ricostruisce dall'IP dell'Endpoint.
const hostOf = (target: Network.Endpoint): Network.Host => Network.host(target.ip);

export const reduce: Machine.Reducer<AndroidBridgeState, AndroidBridgeEvent, AndroidBridgeIntent> = (state, event) =>
  match<[AndroidBridgeState, AndroidBridgeEvent], Machine.Transition<AndroidBridgeState, AndroidBridgeIntent>>([
    state,
    event,
  ])
    .with([{ _tag: "Disconnected" }, { _tag: "ReconnectRequested" }], ([s]) =>
      Machine.transition(connecting(s.id, s.host), [{ _tag: "Connect", host: s.host }]),
    )
    .with([{ _tag: "Connecting" }, { _tag: "ReconnectRequested" }], ([s]) =>
      Machine.transition(connecting(s.id, s.host), [{ _tag: "Connect", host: s.host }]),
    )
    .with([{ _tag: "Connecting" }, { _tag: "ConnectionEstablished" }], ([s, e]) =>
      Machine.transition(idle(s.id, e.target)),
    )
    .with([{ _tag: "Connecting" }, { _tag: "ConnectionFailed" }], ([s, e]) =>
      Machine.transition(disconnected(s.id, s.host, e.reason)),
    )
    .with([{ _tag: "Idle" }, { _tag: "ConnectionLost" }], ([s, e]) =>
      Machine.transition(disconnected(s.id, hostOf(s.target), e.reason)),
    )
    .otherwise(() => Machine.transition(state));
