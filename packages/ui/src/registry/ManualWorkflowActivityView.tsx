import type { StatusTone } from "./StatusPill";
import { StatusPill } from "./StatusPill";

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

export function ManualWorkflowActivityView({ status }: ManualWorkflowActivityViewProps) {
  const [tone, text] = manualWorkflowActivityTone(status);
  return <StatusPill label={text} tone={tone} />;
}
