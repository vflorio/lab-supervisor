import type { StatusTone } from "./StatusPill";
import { StatusPill } from "./StatusPill";

export interface AdbBridgeActivityViewProps {
  readonly status?: string;
}

// FSM android-bridge di una camera (source "adb") - "disconnected" porta anche il motivo tra
// parentesi (es. "disconnected (ECONNREFUSED)"), da cui il prefix match invece di un match esatto.
export function adbBridgeActivityTone(status: string | undefined): [StatusTone, string] {
  if (status === undefined) return ["disabled", "idle"];
  if (status === "connected") return ["success", status];
  if (status === "connecting") return ["warning", status];
  if (status.startsWith("disconnected")) return ["error", status];
  return ["disabled", status];
}

export function AdbBridgeActivityView({ status }: AdbBridgeActivityViewProps) {
  const [tone, text] = adbBridgeActivityTone(status);
  return <StatusPill label={`adb · ${text}`} tone={tone} />;
}
