// ACL verso adb over TCP: è il solo canale con cui si comandano le camere (FATTO-11).
// In questo giro esiste solo la firma (NO-14).
// Travaso: `legacy/core/src/adapters/adb/**` (shell, target-resolution, provisioning),
// `legacy/core/src/android-bridge/**` e `legacy/core/src/shell.ts`. `android-bridge/model.ts` è la
// fonte di FATTO-11 e FATTO-12: il transport "incastrato", e la distinzione fra
// `RebootDispatched` e `ConnectionLost`.
// Attuazioni: `ReconnectTransport` → `adb connect`; `RestartApp` → force-stop + start;
// `RebootHardware` → `adb reboot`; `RelaunchSuite` → la sequenza post-boot completa (lancio app,
// profilo `experimental-wide`, tap sul connect alle coordinate giuste tenendo conto
// dell'orientamento). Quella sequenza è lenta e storicamente inaffidabile: la sua complessità sta
// qui, non nel dominio, che conosce solo il nome del rimedio.
// Qualunque chiamata verso adb può restare appesa (FATTO-12): questo adapter deve avere un timeout
// proprio e restituire `TransportError`, perché la porta non ha canale d'errore (A-6).

import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";

export type AdbConfig = {
  readonly binary: string;
  readonly commandTimeoutMs: number;
};

export declare const make: (config: AdbConfig) => DeviceControlPort;
