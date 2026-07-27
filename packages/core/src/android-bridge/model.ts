import type * as Network from "@supervisor/core/network";

// -------------------------------------------------------------------------------------
// Model - Android Bridge Machine
// -------------------------------------------------------------------------------------
//
// Ciclo di vita di connessione per una camera Android controllata via ADB: prova a
// connettersi, resta Idle finché la connessione è viva, torna Disconnected (e riprova)
// alla prima perdita. `id` = id camera nel lab-registry, `host` = IP non ancora risolto
// in porta, `target` = Endpoint ADB persistente (vedi target-resolution/adb-connection).
//
// Una istanza per camera controlled, gestita da orchestrator.ts.
// -------------------------------------------------------------------------------------

export type AndroidBridgeState =
  | { readonly _tag: "Connecting"; readonly id: string; readonly host: Network.Host }
  | { readonly _tag: "Idle"; readonly id: string; readonly target: Network.Endpoint }
  | {
      readonly _tag: "Disconnected";
      readonly id: string;
      readonly host: Network.Host;
      readonly reason: string;
    };

export type AndroidBridgeEvent =
  // Driven dal tick di polling del dominio chiamante (es. AndroidBridgeOrchestrator.reconcile)
  | { readonly _tag: "ReconnectRequested" }
  | { readonly _tag: "ConnectionEstablished"; readonly target: Network.Endpoint }
  | { readonly _tag: "ConnectionFailed"; readonly reason: string }
  // Driven dalla liveness-detection del dominio chiamante (es. subscription su AdbDeviceStream)
  | { readonly _tag: "ConnectionLost"; readonly reason: string };

export type AndroidBridgeIntent = {
  readonly _tag: "Connect";
  readonly host: Network.Host;
};

export const connecting = (id: string, host: Network.Host): AndroidBridgeState => ({
  _tag: "Connecting",
  id,
  host,
});
export const idle = (id: string, target: Network.Endpoint): AndroidBridgeState => ({
  _tag: "Idle",
  id,
  target,
});
export const disconnected = (id: string, host: Network.Host, reason: string): AndroidBridgeState => ({
  _tag: "Disconnected",
  id,
  host,
  reason,
});

// Solo Idle accetta comandi verso il device: Connecting/Disconnected non hanno una
// connessione utilizzabile.
export const acceptsCommands = (state: AndroidBridgeState): boolean => state._tag === "Idle";
