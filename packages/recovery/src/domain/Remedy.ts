// Il linguaggio con cui il dominio parla all'ACL. `RestartApp` **non** è
// `adb shell am force-stop`: quella è una delle sue attuazioni e vive in `hardware-control`.
// `RelaunchSuite` è la sequenza completa di messa online dell'app di cattura (avvio, profilo,
// tap sul connect), non un secondo `RestartApp`: la sua complessità è dell'ACL (FATTO-11).
// Nessuna variante esprime gli smart plug: fuori scope in questo giro, non vietati (NF-3).

import { type Brand, brand } from "@lab/kernel";
import type { Capability } from "@lab/registry/domain/Capability";

// Quale applicazione riavviare. Opaco per il dominio, come gli endpoint: chi sa cosa farne è
// l'adapter.
export type AppRef = Brand<string, "AppRef">;

export const appRef = (value: string): AppRef => brand<AppRef>(value);

export type Remedy =
  | { readonly _tag: "ReconnectTransport" }
  | { readonly _tag: "RestartApp"; readonly app: AppRef }
  | { readonly _tag: "RelaunchSuite" }
  | { readonly _tag: "PowerOn" }
  | { readonly _tag: "RebootHardware" };

export const reconnectTransport: Remedy = { _tag: "ReconnectTransport" };

export const restartApp = (app: AppRef): Remedy => ({ _tag: "RestartApp", app });

export const relaunchSuite: Remedy = { _tag: "RelaunchSuite" };

export const powerOn: Remedy = { _tag: "PowerOn" };

export const rebootHardware: Remedy = { _tag: "RebootHardware" };

// La capability che quel rimedio pretende. Serve a due controlli diversi: quello precoce, sul
// soprainsieme del kind, che rifiuta un playbook assurdo alla nascita; e quello vero, al
// dispaccio, che guarda ciò che quella singola istanza dichiara (FATTO-1, FL-2).
export const requiredCapability = (remedy: Remedy): Capability => {
  switch (remedy._tag) {
    case "ReconnectTransport":
      return "AdbTcp";
    case "RestartApp":
    case "RelaunchSuite":
      return "AppControl";
    case "PowerOn":
      return "PowerOn";
    case "RebootHardware":
      return "RebootHardware";
  }
};
