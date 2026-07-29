import * as Network from "@supervisor/core/network";
import * as Machine from "@supervisor/core/state-machine/machine";
import { match } from "ts-pattern";
import {
  type AndroidBridgeEvent,
  type AndroidBridgeIntent,
  type AndroidBridgeState,
  connecting,
  disconnected,
  disconnecting,
  idle,
} from "./model";

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
    // Disconnessione attesa (reboot appena dispacciato): nessun `adb disconnect` da fare, il
    // device sta già andando giù per conto suo - serve solo invalidare lo stato subito.
    .with([{ _tag: "Idle" }, { _tag: "RebootDispatched" }], ([s]) =>
      Machine.transition(disconnected(s.id, hostOf(s.target), "reboot dispatched")),
    )
    // Disconnessione sospetta (transport incastrato): a differenza di ConnectionLost il
    // transport locale di adb va ripulito esplicitamente, quindi si passa da Disconnecting
    // con l'intent Disconnect - il ritorno a Disconnected arriva dal suo follow-up.
    .with([{ _tag: "Idle" }, { _tag: "TransportSuspect" }], ([s, e]) =>
      Machine.transition(disconnecting(s.id, hostOf(s.target)), [
        { _tag: "Disconnect", target: s.target, reason: e.reason },
      ]),
    )
    .with([{ _tag: "Disconnecting" }, { _tag: "ConnectionLost" }], ([s, e]) =>
      Machine.transition(disconnected(s.id, s.host, e.reason)),
    )
    // Ogni altra combinazione è un no-op esplicito: un evento non pertinente allo stato
    // corrente non produce transizione, i chiamanti non devono riscriverlo come guard.
    .otherwise(() => Machine.transition(state));
