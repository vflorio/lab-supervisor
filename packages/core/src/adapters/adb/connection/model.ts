import type * as Network from "@supervisor/core/network";

export type ConnectionState =
  | { readonly _tag: "Unknown"; readonly host: string }
  | { readonly _tag: "Temporary"; readonly target: Network.Endpoint }
  | { readonly _tag: "Persistent"; readonly target: Network.Endpoint };

export const unknown = (host: string): ConnectionState => ({ _tag: "Unknown", host });
export const temporary = (target: Network.Endpoint): ConnectionState => ({ _tag: "Temporary", target });
export const persistent = (target: Network.Endpoint): ConnectionState => ({ _tag: "Persistent", target });

export const isPersistent = (state: ConnectionState): state is { _tag: "Persistent"; target: Network.Endpoint } =>
  state._tag === "Persistent";

export type ConnectionEvent =
  | { readonly _tag: "TargetDiscovered"; readonly target: Network.Endpoint }
  | { readonly _tag: "TemporaryHandshakeOk"; readonly target: Network.Endpoint }
  | { readonly _tag: "TemporaryHandshakeFailed"; readonly reason: string }
  | { readonly _tag: "TcpipConfigured"; readonly persistentTarget: Network.Endpoint }
  | { readonly _tag: "PersistentHandshakeOk"; readonly target: Network.Endpoint }
  | { readonly _tag: "PersistentHandshakeFailed"; readonly reason: string }
  | { readonly _tag: "ConnectionLost" }
  | { readonly _tag: "PortChanged"; readonly target: Network.Endpoint };

export type ConnectionIntent =
  | { readonly _tag: "ConnectTemporary"; readonly target: Network.Endpoint }
  | { readonly _tag: "ConfigurePersistentPort"; readonly target: Network.Endpoint }
  | { readonly _tag: "ConnectPersistent"; readonly target: Network.Endpoint }
  | { readonly _tag: "DisconnectTemporary"; readonly target: Network.Endpoint };
