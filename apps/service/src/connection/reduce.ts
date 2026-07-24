import * as Machine from "@supervisor/core/state-machine/machine";
import { match } from "ts-pattern";
import type { ConnectionCommand, ConnectionEvent, TargetState } from "./model";
import { persistent, temporary, unknown } from "./model";

// -------------------------------------------------------------------------------------
// Reducer
// -------------------------------------------------------------------------------------

// Le combinazioni (stato, evento) non previste dal diagramma sono ignorate
// (self-loop senza comandi): rispecchia il fatto che un evento fuori sequenza (es. un handshake
// che risponde dopo che il device è già tornato Unknown) non deve avere effetto.

export const reduce: Machine.Reducer<TargetState, ConnectionEvent, ConnectionCommand> = (state, event) =>
  match<[TargetState, ConnectionEvent], Machine.Transition<TargetState, ConnectionCommand>>([state, event])
    // Unknown -> Temporary

    // (State): Unknown -> (Event): TargetDiscovered -> (State): Temporary -> (Effect): ConnectTemporary
    .with([{ _tag: "Unknown" }, { _tag: "TargetDiscovered" }], ([, e]) =>
      Machine.transition(temporary(e.target), [{ _tag: "ConnectTemporary", target: e.target }]),
    )

    // Temporary -> Persistent | Unknown

    // (State): Temporary -> (Event): TemporaryHandshakeOk -> (State): Temporary -> (Effect): ConfigurePersistentPort
    .with([{ _tag: "Temporary" }, { _tag: "TemporaryHandshakeOk" }], ([, e]) =>
      Machine.transition(temporary(e.target), [{ _tag: "ConfigurePersistentPort", target: e.target }]),
    )
    // (State): Temporary -> (Event): TemporaryHandshakeFailed -> (State): Unknown
    .with([{ _tag: "Temporary" }, { _tag: "TemporaryHandshakeFailed" }], ([s]) =>
      Machine.transition(unknown(s.target.ip)),
    )

    // Temporary -> Persistent

    // (State): Temporary -> (Event): TcpipConfigured -> (State): Temporary -> (Effect): ConnectPersistent
    .with([{ _tag: "Temporary" }, { _tag: "TcpipConfigured" }], ([, e]) =>
      Machine.transition(state, [{ _tag: "ConnectPersistent", target: e.persistentTarget }]),
    )

    // (State): Temporary -> (Event): PersistentHandshakeOk -> (State): Persistent -> (Effect): DisconnectTemporary
    .with([{ _tag: "Temporary" }, { _tag: "PersistentHandshakeOk" }], ([s, e]) =>
      Machine.transition(persistent(e.target), [{ _tag: "DisconnectTemporary", target: s.target }]),
    )
    // (State): Temporary -> (Event): PersistentHandshakeFailed -> (State): Unknown
    .with([{ _tag: "Temporary" }, { _tag: "PersistentHandshakeFailed" }], ([s]) =>
      Machine.transition(unknown(s.target.ip)),
    )

    // Connection Lost

    // (State): Persistent -> (Event): ConnectionLost -> (State): Unknown
    .with([{ _tag: "Temporary" }, { _tag: "ConnectionLost" }], ([s]) => Machine.transition(unknown(s.target.ip)))
    // (State): Persistent -> (Event): ConnectionLost -> (State): Unknown
    .with([{ _tag: "Persistent" }, { _tag: "ConnectionLost" }], ([s]) => Machine.transition(unknown(s.target.ip)))

    // Port Changed

    // (State): Persistent -> (Event): PortChanged -> (State): Temporary -> (Effect): ConnectTemporary
    .with([{ _tag: "Persistent" }, { _tag: "PortChanged" }], ([, e]) =>
      Machine.transition(temporary(e.target), [{ _tag: "ConnectTemporary", target: e.target }]),
    )

    .otherwise(() => Machine.transition(state));
