import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface PickerOption {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly trailing?: ReactNode;
}

export interface PickerProps {
  readonly options: readonly PickerOption[];
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
  readonly label?: string;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
}

export function renderPickerOption(
  props: React.HTMLAttributes<HTMLLIElement> & { key: React.Key },
  option: PickerOption,
) {
  // React vuole `key` passata direttamente alla JSX, non dentro lo spread - MUI la include
  // nel `props` di renderOption, quindi va estratta prima di spargere il resto.
  const { key, ...rest } = props;
  return (
    <Box component="li" key={key} {...rest}>
      <Stack sx={{ gap: 0.25, minWidth: 0, flex: 1 }}>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {option.primary}
          </Typography>
          {option.trailing}
        </Stack>
        {option.secondary && (
          <Typography variant="caption" color="textSecondary">
            {option.secondary}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export function Picker({
  options,
  value,
  onChange,
  label,
  placeholder,
  emptyMessage,
  disabled,
  autoFocus,
}: PickerProps) {
  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <Autocomplete
      options={options}
      size="small"
      value={selected}
      onChange={(_, option) => onChange(option?.id ?? null)}
      getOptionLabel={(option) => option.primary}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      noOptionsText={emptyMessage ?? "No options"}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} size="small" label={label} placeholder={placeholder} autoFocus={autoFocus} />
      )}
      renderOption={renderPickerOption}
    />
  );
}
