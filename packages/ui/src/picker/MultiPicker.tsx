import { Autocomplete, Chip, TextField } from "@mui/material";
import { type PickerOption, renderPickerOption } from "./Picker";

export interface MultiPickerProps {
  readonly options: readonly PickerOption[];
  readonly value: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  readonly label?: string;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
}

// Variante multi-select di Picker: stessa search-as-you-type, `onChange` riceve la
// selezione completa (non un singolo toggle) - com'e' naturale per Autocomplete `multiple`.
export function MultiPicker({
  options,
  value,
  onChange,
  label,
  placeholder,
  emptyMessage,
  disabled,
}: MultiPickerProps) {
  const selected = options.filter((option) => value.includes(option.id));

  return (
    <Autocomplete<PickerOption, true, false, false>
      multiple
      options={options}
      value={selected}
      onChange={(_, next) => onChange(next.map((option) => option.id))}
      getOptionLabel={(option) => option.primary}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      noOptionsText={emptyMessage ?? "No options"}
      disabled={disabled}
      renderValue={(selectedOptions, getItemProps) =>
        selectedOptions.map((option, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return <Chip size="small" label={option.primary} key={option.id} {...itemProps} />;
        })
      }
      renderInput={(params) => <TextField {...params} size="small" label={label} placeholder={placeholder} />}
      renderOption={renderPickerOption}
    />
  );
}
