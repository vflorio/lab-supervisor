import type * as Network from "@supervisor/core/network";

// Ciclo di vita di connessione per una camera Android controllata via ADB: prova a
// connettersi, resta Idle finché la connessione è viva, torna Disconnected (e riprova)
// alla prima perdita. `id` = id camera nel lab-registry, `host` = IP non ancora risolto
// in porta, `target` = Endpoint ADB persistente. Una istanza per camera controlled.

export type AndroidBridgeState =
  | { readonly _tag: "Connecting"; readonly id: string; readonly host: Network.Host }
  | { readonly _tag: "Idle"; readonly id: string; readonly target: Network.Endpoint }
  // Simmetrico a Connecting: fase in volo mentre l'`adb disconnect` esplicito è in corso.
  // Non accetta comandi e non viene ritentata dal reconcile (che riprova solo le Disconnected):
  // la transizione a Disconnected arriva dall'evento di follow-up dell'intent Disconnect.
  | { readonly _tag: "Disconnecting"; readonly id: string; readonly host: Network.Host }
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
  | { readonly _tag: "ConnectionLost"; readonly reason: string }
  // Disconnessione attesa: reboot dispacciato con successo, il device sta per sparire per
  // certo. Senza questo evento lo stato resterebbe Idle (stale) finché il poll non se ne
  // accorge da solo, e un'attesa di riconnessione partita subito dopo tornerebbe subito.
  | { readonly _tag: "RebootDispatched" }
  // Disconnessione sospetta: comando in timeout pur con camera raggiungibile - transport ADB
  // "incastrato", invisibile alla liveness-detection. Richiede un `adb disconnect` esplicito:
  // un semplice reconnect non ripulisce una entry di transport stale.
  | { readonly _tag: "TransportSuspect"; readonly reason: string };

export type AndroidBridgeIntent =
  | { readonly _tag: "Connect"; readonly host: Network.Host }
  | { readonly _tag: "Disconnect"; readonly target: Network.Endpoint; readonly reason: string };

export const connecting = (id: string, host: Network.Host): AndroidBridgeState => ({
  _tag: "Connecting",
  id,
  host,
});
export const disconnecting = (id: string, host: Network.Host): AndroidBridgeState => ({
  _tag: "Disconnecting",
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
