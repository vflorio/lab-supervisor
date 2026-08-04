import { Chip } from "@mui/material";
import { Picker } from "../picker/Picker";

export interface FactOption {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
}

export interface FactRefPickerProps {
  readonly options: readonly FactOption[];
  readonly value: string;
  readonly onChange: (name: string) => void;
}

export function FactRefPicker({ options, value, onChange }: FactRefPickerProps) {
  const uniqueByName = Array.from(new Map(options.map((option) => [option.name, option])).values());

  return (
    <Picker
      options={uniqueByName.map((option) => ({
        id: option.name,
        primary: option.name,
        secondary: option.entityId,
        trailing: <Chip label={option.domain} size="small" />,
      }))}
      value={value || null}
      onChange={(name) => onChange(name ?? "")}
      label="fact"
      placeholder="Cerca fact..."
    />
  );
}
