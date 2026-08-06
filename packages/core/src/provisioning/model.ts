import * as O from "fp-ts/Option";
import type { AgentStatus } from "../adapters/adb/provisioning";
import type { Fact, FactValue } from "../fact/model";

// Logica pura del provisioning: stato alla sequenza minima di passi. Testabile senza hardware.

export const DOMAIN = "agent";

// -------------------------------------------------------------------------------------
// Passi
// -------------------------------------------------------------------------------------

export type Step =
  | { readonly _tag: "Install" }
  | { readonly _tag: "Grant" }
  | { readonly _tag: "ExemptDoze" }
  | { readonly _tag: "LaunchOnce" };

export const stepLabel = (step: Step): string => {
  switch (step._tag) {
    case "Install":
      return "install agent APK";
    case "Grant":
      return "grant WRITE_SECURE_SETTINGS";
    case "ExemptDoze":
      return "exempt from doze";
    case "LaunchOnce":
      return "first launch";
  }
};

// -------------------------------------------------------------------------------------
// Check (una riga di stato, riusata da fatti e UI)
// -------------------------------------------------------------------------------------

// Sei condizioni indipendenti mostrate singolarmente: install diverso da grant diverso da servizio
export interface Check {
  readonly name: string;
  readonly label: string;
  readonly read: (status: AgentStatus) => boolean;
}

export const CHECKS: readonly Check[] = [
  { name: "agent_installed", label: "installed", read: (s) => s.installed },
  { name: "agent_permission_granted", label: "WRITE_SECURE_SETTINGS", read: (s) => s.permissionGranted },
  { name: "agent_wifi_debugging", label: "adb_wifi_enabled", read: (s) => s.wifiDebuggingEnabled },
  { name: "agent_usb_debugging", label: "adb_enabled", read: (s) => s.usbDebuggingEnabled },
  { name: "agent_doze_exempt", label: "doze exempt", read: (s) => s.dozeExempt },
  { name: "agent_service_running", label: "service foreground", read: (s) => s.serviceRunning },
];

// Fatto aggregato: guida visibilita bottone e tripwire di recovery
export const PROVISIONED_FACT = "agent_provisioned";

export const isHealthy = (status: AgentStatus): boolean => CHECKS.every((check) => check.read(status));

export const toFacts = (status: AgentStatus): Readonly<Record<string, FactValue>> => ({
  ...Object.fromEntries(CHECKS.map((check) => [check.name, check.read(status)])),
  [PROVISIONED_FACT]: isHealthy(status),
});

export const factsFor = (entityId: string, status: AgentStatus): readonly Fact[] =>
  Object.entries(toFacts(status)).map(([name, value]) => ({ domain: DOMAIN, entityId, name, value }));

// -------------------------------------------------------------------------------------
// Piano
// -------------------------------------------------------------------------------------

// Upgrade se piu vecchio; lascia solo se piu nuovo (downgrade perderebbe il grant)
const needsUpgrade = (status: AgentStatus, expectedVersionCode: O.Option<number>): boolean =>
  O.isSome(expectedVersionCode) && O.isSome(status.versionCode) && status.versionCode.value < expectedVersionCode.value;

// L'ordine vincolante: grant prima di launch (agent ha bisogno del permesso)
export const plan = (status: AgentStatus, expectedVersionCode: O.Option<number> = O.none): readonly Step[] => {
  // Da zero: install solo non concede nulla; app rimane in stopped state
  if (!status.installed) {
    return [{ _tag: "Install" }, { _tag: "Grant" }, { _tag: "ExemptDoze" }, { _tag: "LaunchOnce" }];
  }

  const upgrade = needsUpgrade(status, expectedVersionCode);
  const steps: Step[] = [];

  if (upgrade) steps.push({ _tag: "Install" });
  if (!status.permissionGranted) steps.push({ _tag: "Grant" });
  if (!status.dozeExempt) steps.push({ _tag: "ExemptDoze" });

  // adb_*_enabled li imposta l'agent a ogni launch; host non tocca Settings.
  // Grant nuovo richiede anche launch (agent rilegge permesso solo a boot/rete)
  if (
    upgrade ||
    !status.permissionGranted ||
    !status.serviceRunning ||
    !status.wifiDebuggingEnabled ||
    !status.usbDebuggingEnabled
  ) {
    steps.push({ _tag: "LaunchOnce" });
  }

  return steps;
};
