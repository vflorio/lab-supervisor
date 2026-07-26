import * as Machine from "@supervisor/core/state-machine/machine";
import type { AdbConnectionMachineEnv } from "./interpret";
import { interpret } from "./interpret";
import type * as Model from "./model";
import { reduce } from "./reduce";
import { onTransition } from "./tracing";

// =========================================================================================
//  AdbConnection
// =========================================================================================
//
// STATES     Unknown{host}
//            Temporary{target}
//            Persistent{target}
//
// EVENTS     TargetDiscovered
//            TemporaryHandshakeOk  TemporaryHandshakeFailed
//            TcpipConfigured
//            PersistentHandshakeOk  PersistentHandshakeFailed
//            ConnectionLost  PortChanged
//
// COMMANDS   ConnectTemporary
//            ConfigurePersistentPort
//            ConnectPersistent
//            DisconnectTemporary
//
// -----------------------------------------------------------------------------------------
//     [*] --> Unknown
//
//     Unknown --> Temporary    : TargetDiscovered / ConnectTemporary
//
//     Temporary --> Temporary  : TemporaryHandshakeOk / ConfigurePersistentPort
//     Temporary --> Temporary  : TcpipConfigured / ConnectPersistent
//     Temporary --> Persistent : PersistentHandshakeOk / DisconnectTemporary
//     Temporary --> Unknown    : TemporaryHandshakeFailed
//     Temporary --> Unknown    : PersistentHandshakeFailed
//     Temporary --> Unknown    : ConnectionLost
//
//     Persistent --> Unknown   : ConnectionLost
//     Persistent --> Temporary : PortChanged / ConnectTemporary
//
// -----------------------------------------------------------------------------------------
// TRANSITIONS  <FROM> -> <EVENT> -> <TO> [/ <COMMAND>]
// Le coppie (stato, evento) non elencate sono self-loop senza comandi
// (evento fuori sequenza: ignorato, vedi commento in reduce.ts).
//
//   Unknown     -> TargetDiscovered          -> Temporary   / ConnectTemporary
//   Temporary   -> TemporaryHandshakeOk      -> Temporary   / ConfigurePersistentPort
//   Temporary   -> TemporaryHandshakeFailed  -> Unknown
//   Temporary   -> TcpipConfigured           -> Temporary   / ConnectPersistent
//   Temporary   -> PersistentHandshakeOk     -> Persistent  / DisconnectTemporary
//   Temporary   -> PersistentHandshakeFailed -> Unknown
//   Temporary   -> ConnectionLost            -> Unknown
//   Persistent  -> ConnectionLost            -> Unknown
//   Persistent  -> PortChanged               -> Temporary   / ConnectTemporary
// =========================================================================================

const machine: Machine.Machine<
  AdbConnectionMachineEnv,
  never,
  Model.ConnectionState,
  Model.ConnectionEvent,
  Model.ConnectionIntent
> = Machine.make(reduce, interpret, onTransition);

export const dispatch = Machine.dispatch(machine);
