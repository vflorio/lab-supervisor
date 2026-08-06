import { Tooltip } from "@mui/material";
import { IndicatorStat } from "../IndicatorStat";
import type { StatusTone } from "../StatusPill";

export interface AgentProvisionedViewProps {
  readonly value?: boolean; // undefined = stato ignoto
  readonly missing?: readonly string[]; // Check falliti (grant diverso da app, riparazione diversa)
}

// Distinto dalla raggiungibilita ADB: device puo rispondere ad adb ma non avere l'agent
export function AgentProvisionedView({ value, missing = [] }: AgentProvisionedViewProps) {
  const [tone, text]: [StatusTone, string] =
    value === undefined
      ? ["disabled", "unknown"]
      : value
        ? ["success", "ready"]
        : ["error", missing.length > 0 ? `${missing.length} missing` : "not ready"];

  const indicator = <IndicatorStat label="AGENT" value={text} tone={tone} />;

  if (missing.length === 0) return indicator;

  return (
    <Tooltip title={missing.join(", ")} arrow>
      <span>{indicator}</span>
    </Tooltip>
  );
}
