import * as AndroidBridgeMachine from "@supervisor/core/state-machine/machine";
import { forwardToActivity } from "./hooks/activity";
import { logStateChange } from "./hooks/tracing";
import type { AndroidBridgeMachineEnv } from "./interpret";
import { interpret } from "./interpret";
import type * as Model from "./model";
import { reduce } from "./reduce";

export * from "./interpret";
export * from "./model";

// =========================================================================================
//  AndroidBridge
// =========================================================================================
//
// Layer applicativo sopra target-resolution/adb-connection: rappresenta il ciclo di vita di
// UNA camera controlled. Non conosce i dettagli di mDNS/ADB - delega tutto a
// TargetResolution.connect e si limita a tradurne l'esito in "posso accettare comandi adesso?".
//
// STATES     Connecting{id, host}   Idle{id, target}   Disconnecting{id, host}
//            Disconnected{id, host, reason}
//
// EVENTS     ReconnectRequested   ConnectionEstablished   ConnectionFailed   ConnectionLost
//            RebootDispatched   TransportSuspect
//
// COMMANDS   Connect   Disconnect
//
// -----------------------------------------------------------------------------------------
//     [*] --> Disconnected
//
//     Disconnected  --> Connecting   : ReconnectRequested / Connect
//     Connecting    --> Connecting   : ReconnectRequested / Connect
//     Connecting    --> Idle         : ConnectionEstablished
//     Connecting    --> Disconnected : ConnectionFailed
//     Idle          --> Disconnected : ConnectionLost
//     Idle          --> Disconnected : RebootDispatched
//     Idle          --> Disconnecting: TransportSuspect / Disconnect
//     Disconnecting --> Disconnected : ConnectionLost
// -----------------------------------------------------------------------------------------
// TRANSITIONS  <FROM> -> <EVENT> -> <TO> [/ <COMMAND>]     (definite nel reducer)
//
//   Disconnected  -> ReconnectRequested    -> Connecting    / Connect
//   Connecting    -> ReconnectRequested    -> Connecting    / Connect
//   Connecting    -> ConnectionEstablished -> Idle
//   Connecting    -> ConnectionFailed      -> Disconnected
//   Idle          -> ConnectionLost        -> Disconnected
//   Idle          -> RebootDispatched      -> Disconnected
//   Idle          -> TransportSuspect      -> Disconnecting / Disconnect
//   Disconnecting -> ConnectionLost        -> Disconnected
//
// Ogni altra coppia (stato, evento) è un no-op: è il reducer l'unica autorità su quali eventi
// sono pertinenti a quale stato - nessun chiamante deve pre-filtrare prima di dispatchare.
//
// =========================================================================================

const machine: AndroidBridgeMachine.Machine<
  AndroidBridgeMachineEnv,
  never,
  Model.AndroidBridgeState,
  Model.AndroidBridgeEvent,
  Model.AndroidBridgeIntent
> = AndroidBridgeMachine.make(
  reduce,
  interpret,
  AndroidBridgeMachine.composeTransitionHooks(logStateChange, forwardToActivity),
);

export const dispatch = AndroidBridgeMachine.dispatch(machine);
