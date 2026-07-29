import { Box, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import type { DayOfWeek } from "@supervisor/core/date-time";
import { ScheduleGrid } from "./ScheduleGrid";

const DAYS: readonly DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Gio",
  friday: "Ven",
  saturday: "Sab",
  sunday: "Dom",
};
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Form controllata per un ActivationSchedule: giorni attivi (toggle multiplo) + range orario,
// con la stessa griglia di ActivationScheduleView come anteprima live del draft.
export interface ActivationScheduleFormProps {
  readonly value: ActivationSchedule;
  readonly onChange: (next: ActivationSchedule) => void;
}

export function ActivationScheduleForm({ value, onChange }: ActivationScheduleFormProps) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography
          sx={{
            ...mono,
            fontSize: 10,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            mb: 1,
          }}
        >
          Giorni attivi
        </Typography>
        <ToggleButtonGroup
          value={value.days}
          size="small"
          onChange={(_, days: DayOfWeek[]) => onChange({ ...value, days })}
          sx={{
            flexWrap: "wrap",
            gap: 0.5,
            "& .MuiToggleButtonGroup-grouped": {
              border: "1px solid !important",
              borderColor: "divider",
              borderRadius: "6px !important",
              mx: 0,
            },
          }}
        >
          {DAYS.map((day) => (
            <ToggleButton key={day} value={day} sx={mono}>
              {DAY_SHORT[day]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Stack direction="row" sx={{ gap: 2, alignItems: "flex-end" }}>
        <TextField
          label="From"
          size="small"
          type="time"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value as ActivationSchedule["from"] })}
          sx={{ width: 130 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Box sx={{ pb: 1, color: "text.secondary" }}>→</Box>
        <TextField
          label="To"
          size="small"
          type="time"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value as ActivationSchedule["to"] })}
          sx={{ width: 130 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      <ScheduleGrid value={value} />
    </Stack>
  );
}
