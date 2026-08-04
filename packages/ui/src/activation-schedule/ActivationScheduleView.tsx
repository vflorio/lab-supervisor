import { Stack, Typography } from "@mui/material";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import { ScheduleGrid } from "./ScheduleGrid";

export interface ActivationScheduleViewProps {
  readonly value: ActivationSchedule;
}

export function ActivationScheduleView({ value }: ActivationScheduleViewProps) {
  return (
    <Stack spacing={1}>
      <Typography variant="monoTitle" color="textSecondary">
        {value.days.length === 7 ? "Tutti i giorni" : value.days.join(", ")} - {value.from}–{value.to}
      </Typography>
      <ScheduleGrid value={value} />
    </Stack>
  );
}
