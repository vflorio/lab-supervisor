import type { LoopEntry } from "@supervisor/core/task-runner/model";
import { type LoopWidgetProps, ServiceStrip } from "@supervisor/ui/task-runner";
import { useLoops } from "../hooks/useLoops";

const toLoopWidgetProps = (entry: LoopEntry): LoopWidgetProps => ({
  id: entry.id,
  label: entry.label,
  state: entry.status,
  iteration: entry.iteration,
  lastTickAt: entry.lastTickAt,
  nextTickAt: entry.nextTickAt,
  delayMs: entry.delayMs,
  policyLabel: entry.policyLabel,
  detail: entry.detail,
});

// Sezione "Overview" del pannello destro (vedi LogPanel.tsx): stessi vital sign del servizio
// che prima stavano in testa alla Homepage, ora sempre disponibili accanto ai log.
export function OverviewPanel() {
  const loops = useLoops();
  return <ServiceStrip connection={loops.status} loops={loops.sorted.map(toLoopWidgetProps)} />;
}
