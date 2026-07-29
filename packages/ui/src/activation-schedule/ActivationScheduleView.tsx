import { Stack, Typography } from "@mui/material";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import { ScheduleGrid } from "./ScheduleGrid";

// Render readonly di un ActivationSchedule: riepilogo giorni/orario + griglia 7gg x 24h.
export interface ActivationScheduleViewProps {
  readonly value: ActivationSchedule;
}

export function ActivationScheduleView({ value }: ActivationScheduleViewProps) {
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "textSecondary" }}>
        {value.days.length === 7 ? "Tutti i giorni" : value.days.join(", ")} · {value.from}–{value.to}
      </Typography>
      <ScheduleGrid value={value} />
    </Stack>
  );
}
