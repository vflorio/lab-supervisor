import { Chip } from "@mui/material";
import { Picker } from "../picker/Picker";

// Un predicato osservato dal tracking live (vedi trpc.tracking.snapshot) - il chiamante
// fornisce la lista, questo componente resta puro/senza IO.
export interface PredicateOption {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
}

// Picker con ricerca per un singolo nome di predicato, usato dallo step "Predicate" del
// TripwireWizard - alimentato dai predicati realmente osservati invece di una lista mock,
// sul Picker generico condiviso con gli altri picker server-driven (workflow, device...).
export interface PredicateRefPickerProps {
  readonly options: readonly PredicateOption[];
  readonly value: string;
  readonly onChange: (name: string) => void;
}

export function PredicateRefPicker({ options, value, onChange }: PredicateRefPickerProps) {
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
      label="predicate"
      placeholder="Cerca predicate..."
    />
  );
}
