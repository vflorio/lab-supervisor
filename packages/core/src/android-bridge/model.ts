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
  // Disconnessione ATTESA: il chiamante ha appena dispacciato un reboot con successo, quindi
  // sa per certo che il device sta per sparire. Senza questo evento lo stato resterebbe Idle
  // (stale) finché il poll di adbDeviceStream non se ne accorge da solo (fino a
  // tracking.adb.polling), e un'attesa di riconnessione partita subito dopo leggerebbe quello
  // stato stale tornando immediatamente, senza aver mai atteso davvero.
  | { readonly _tag: "RebootDispatched" }
  // Disconnessione SOSPETTA: un comando è andato in timeout pur risultando la camera
  // raggiungibile. È il caso del transport ADB "incastrato" - `adb devices` continua a
  // riportarlo come "device" ma non risponde più - che la liveness-detection non può rilevare
  // (per questo non è un ConnectionLost). Richiede un `adb disconnect` esplicito: un semplice
  // reconnect non ripulisce una entry di transport stale nella tabella locale di adb.
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
