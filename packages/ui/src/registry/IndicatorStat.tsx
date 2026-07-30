import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { StatusTone } from "./StatusPill";

const TONE_TEXT_COLOR: Record<StatusTone, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface IndicatorStatProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: StatusTone;
}

// Coppia eyebrow/valore per una singola cella della zona `indicators` di EntryRow - stesso
// stile di un item DetailGrid, ma renderizzabile da solo tra i divider di EntryRow invece che
// dentro la sua griglia auto-fill.
export function IndicatorStat({ label, value, tone }: IndicatorStatProps) {
  return (
    <Box sx={{ textAlign: "right" }}>
      <Typography variant="monoEyebrow" sx={{ color: "textSecondary", display: "block" }}>
        {label}
      </Typography>
      <Typography variant="monoLabel" sx={{ fontWeight: 700, color: tone ? TONE_TEXT_COLOR[tone] : "text.primary" }}>
        {value}
      </Typography>
    </Box>
  );
}
