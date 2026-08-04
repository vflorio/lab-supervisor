import { Button } from "@mui/material";
import { match } from "ts-pattern";
import type { StatusTone } from "../StatusPill";
import { StatusPill } from "../StatusPill";

export interface RecoveryActivityViewProps {
  readonly status?: string;
}

// Stati del tripwire di recovery (source "recovery") - "exhausted" e "fatalError" sono
// entrambi terminali e richiedono intervento manuale, da cui lo stesso tono per entrambi.
export function recoveryActivityTone(status: string | undefined): [StatusTone, string] {
  if (status === undefined) return ["disabled", "idle"];
  return match<string, [StatusTone, string]>(status)
    .with("healthy", (s) => ["success", s])
    .with("pending", (s) => ["warning", s])
    .with("recovering", (s) => ["info", s])
    .with("exhausted", "fatalError", (s) => ["error", s])
    .otherwise((s) => ["disabled", s]);
}

// Un tripwire fermo in questi due stati richiede il reset manuale dell'operatore (§6.3) -
// esposta a parte così CameraRow/TvRow/ControlUnitRow decidono se mostrare "Rearm recovery"
// senza duplicare la logica di stato.
export function isRecoveryStuck(status: string | undefined): boolean {
  return status === "exhausted" || status === "fatalError";
}

export function RecoveryActivityView({ status }: RecoveryActivityViewProps) {
  const [tone, text] = recoveryActivityTone(status);
  return <StatusPill label={`recovery - ${text}`} tone={tone} />;
}

export interface RearmRecoveryButtonProps {
  readonly recoveryStatus?: string;
  readonly onRearmRecovery?: () => void;
}

// Bottone azione gemello di RecoveryActivityView (stessa condizione `isRecoveryStuck`) -
// centralizzato qui perché CameraRow/TvRow/ControlUnitRow lo renderizzavano ciascuna con lo
// stesso markup copiato.
export function RearmRecoveryButton({ recoveryStatus, onRearmRecovery }: RearmRecoveryButtonProps) {
  if (!isRecoveryStuck(recoveryStatus) || !onRearmRecovery) return null;
  return (
    <Button size="small" variant="outlined" color="error" onClick={onRearmRecovery}>
      Rearm recovery
    </Button>
  );
}
