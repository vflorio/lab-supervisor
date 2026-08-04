import type { StatusTone } from "./StatusPill";
import { StatusPill } from "./StatusPill";

export interface RecoveryActivityViewProps {
  readonly status?: string;
}

// Stati del tripwire di recovery (source "recovery") - "exhausted" e "fatalError" sono
// entrambi terminali e richiedono intervento manuale, da cui lo stesso tono per entrambi.
export function recoveryActivityTone(status: string | undefined): [StatusTone, string] {
  if (status === undefined) return ["disabled", "idle"];
  switch (status) {
    case "healthy":
      return ["success", status];
    case "pending":
      return ["warning", status];
    case "recovering":
      return ["info", status];
    case "exhausted":
    case "fatalError":
      return ["error", status];
    default:
      return ["disabled", status];
  }
}

// Un tripwire fermo in questi due stati richiede il reset manuale dell'operatore (§6.3) -
// esposta a parte così CameraRow/TvRow/ControlUnitRow decidono se mostrare "Reset recovery"
// senza duplicare la logica di stato.
export function isRecoveryStuck(status: string | undefined): boolean {
  return status === "exhausted" || status === "fatalError";
}

export function RecoveryActivityView({ status }: RecoveryActivityViewProps) {
  const [tone, text] = recoveryActivityTone(status);
  return <StatusPill label={`recovery - ${text}`} tone={tone} />;
}
