import { MenuItem, Select, type SelectChangeEvent, Stack } from "@mui/material";
import { type DurationString, type DurationUnit, decomposeDuration, formatDuration } from "@supervisor/core/date-time";
import { NumberField } from "../misc/number-field/NumberField";

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
      <NumberField label={label} value={amount} onChange={(next) => onChange(formatDuration(next, unit))} width={100} />
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
