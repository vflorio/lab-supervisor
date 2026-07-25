import * as Machine from "@supervisor/core/state-machine/machine";
import type { AndroidBridgeMachineEnv } from "./interpret";
import { interpret } from "./interpret";
import type * as Model from "./model";
import { reduce } from "./reduce";
import { onTransition } from "./tracing";

// =========================================================================================
//  AndroidBridge
// =========================================================================================
//
// Layer applicativo sopra target-resolution/adb-connection: rappresenta il ciclo di vita di
// UNA camera controlled (vedi orchestrator.ts per la gestione multi-camera).
// Non conosce i dettagli di mDNS/ADB - delega tutto a TargetResolution.connect (vedi interpret.ts)
// e si limita a tradurne l'esito in "posso accettare comandi per questa camera adesso?".
//
// STATES     Connecting{id, host}   Idle{id, target}   Disconnected{id, host, reason}
//
// EVENTS     ReconnectRequested   ConnectionEstablished   ConnectionFailed   ConnectionLost
//
// COMMANDS   Connect
//
// -----------------------------------------------------------------------------------------
//     [*] --> Disconnected
//
//     Disconnected --> Connecting  : ReconnectRequested / Connect
//     Connecting   --> Connecting  : ReconnectRequested / Connect
//     Connecting   --> Idle        : ConnectionEstablished
//     Connecting   --> Disconnected: ConnectionFailed
//     Idle         --> Disconnected: ConnectionLost
// -----------------------------------------------------------------------------------------
// TRANSITIONS  <FROM> -> <EVENT> -> <TO> [/ <COMMAND>]     (definite in reduce.ts)
//
//   Disconnected -> ReconnectRequested    -> Connecting   / Connect
//   Connecting   -> ReconnectRequested    -> Connecting   / Connect
//   Connecting   -> ConnectionEstablished -> Idle
//   Connecting   -> ConnectionFailed      -> Disconnected
//   Idle         -> ConnectionLost        -> Disconnected
//
// =========================================================================================

const machine: Machine.Machine<
  AndroidBridgeMachineEnv,
  never,
  Model.AndroidBridgeState,
  Model.AndroidBridgeEvent,
  Model.AndroidBridgeIntent
> = Machine.make(reduce, interpret, onTransition);

export const dispatch = Machine.dispatch(machine);
