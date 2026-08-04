import type { StatusTone } from "../StatusPill";
import { StatusPill } from "../StatusPill";

export interface ManualWorkflowActivityViewProps {
  readonly status?: string;
}

// Esito dell'ultimo lancio manuale di un workflow (source "manual-workflow") - "running:<name>"
// e "failed: <message>" portano un suffisso variabile, da cui i prefix match. Il testo è già
// autoesplicativo (a differenza di recovery/adb) quindi nessun prefisso aggiuntivo nel label.
export function manualWorkflowActivityTone(status: string | undefined): [StatusTone, string] {
  if (status === undefined) return ["disabled", "idle"];
  if (status.startsWith("running:")) return ["info", status];
  if (status === "succeeded") return ["success", status];
  if (status.startsWith("failed")) return ["error", status];
  return ["disabled", status];
}

// A differenza di recovery/adb (sempre rilevanti), un lancio manuale è un evento raro: il
// pill resta nascosto in idle invece di occupare spazio in ogni riga TV per il caso comune
// in cui non è mai stato lanciato nulla.
export function ManualWorkflowActivityView({ status }: ManualWorkflowActivityViewProps) {
  if (status === undefined) return null;
  const [tone, text] = manualWorkflowActivityTone(status);
  return <StatusPill label={text} tone={tone} />;
}
