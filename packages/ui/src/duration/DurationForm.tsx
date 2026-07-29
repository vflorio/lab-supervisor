import { MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import { type DurationString, type DurationUnit, decomposeDuration, formatDuration } from "@supervisor/core/date-time";

const UNITS: readonly DurationUnit[] = ["ms", "s", "m", "h"];

// Form controllata per un DurationString: number + unit, ricomposta a ogni edit.
export interface DurationFormProps {
  readonly value: DurationString;
  readonly onChange: (next: DurationString) => void;
  readonly label?: string;
}

export function DurationForm({ value, onChange, label }: DurationFormProps) {
  const { value: amount, unit } = decomposeDuration(value);

  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
      <TextField
        size="small"
        type="number"
        label={label}
        value={amount}
        onChange={(event) => onChange(formatDuration(Number(event.target.value), unit))}
        sx={{ width: 100 }}
      />
      <Select
        size="small"
        value={unit}
        onChange={(event: SelectChangeEvent) => onChange(formatDuration(amount, event.target.value as DurationUnit))}
        sx={{ width: 80 }}
      >
        {UNITS.map((u) => (
          <MenuItem key={u} value={u}>
            {u}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
}
