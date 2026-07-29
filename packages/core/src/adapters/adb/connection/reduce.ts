import * as Machine from "@supervisor/core/state-machine/machine";
import { match } from "ts-pattern";
import type { ConnectionEvent, ConnectionIntent, ConnectionState } from "./model";
import { persistent, temporary, unknown } from "./model";

// Le combinazioni (stato, evento) non previste dal diagramma FSM sono ignorate (self-loop
// senza comandi): un evento fuori sequenza (es. un handshake che risponde dopo che il device
// è già tornato Unknown) non deve avere effetto.

export const reduce: Machine.Reducer<ConnectionState, ConnectionEvent, ConnectionIntent> = (state, event) =>
  match<[ConnectionState, ConnectionEvent], Machine.Transition<ConnectionState, ConnectionIntent>>([state, event])
    .with([{ _tag: "Unknown" }, { _tag: "TargetDiscovered" }], ([, e]) =>
      Machine.transition(temporary(e.target), [{ _tag: "ConnectTemporary", target: e.target }]),
    )
    .with([{ _tag: "Temporary" }, { _tag: "TemporaryHandshakeOk" }], ([, e]) =>
      Machine.transition(temporary(e.target), [{ _tag: "ConfigurePersistentPort", target: e.target }]),
    )
    .with([{ _tag: "Temporary" }, { _tag: "TemporaryHandshakeFailed" }], ([s]) =>
      Machine.transition(unknown(s.target.ip)),
    )
    .with([{ _tag: "Temporary" }, { _tag: "TcpipConfigured" }], ([, e]) =>
      Machine.transition(state, [{ _tag: "ConnectPersistent", target: e.persistentTarget }]),
    )
    .with([{ _tag: "Temporary" }, { _tag: "PersistentHandshakeOk" }], ([s, e]) =>
      Machine.transition(persistent(e.target), [{ _tag: "DisconnectTemporary", target: s.target }]),
    )
    .with([{ _tag: "Temporary" }, { _tag: "PersistentHandshakeFailed" }], ([s]) =>
      Machine.transition(unknown(s.target.ip)),
    )
    .with([{ _tag: "Temporary" }, { _tag: "ConnectionLost" }], ([s]) => Machine.transition(unknown(s.target.ip)))
    .with([{ _tag: "Persistent" }, { _tag: "ConnectionLost" }], ([s]) => Machine.transition(unknown(s.target.ip)))
    .with([{ _tag: "Persistent" }, { _tag: "PortChanged" }], ([, e]) =>
      Machine.transition(temporary(e.target), [{ _tag: "ConnectTemporary", target: e.target }]),
    )
    .otherwise(() => Machine.transition(state));
