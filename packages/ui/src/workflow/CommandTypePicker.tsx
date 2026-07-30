import { Box } from "@mui/material";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import { Picker } from "../picker/Picker";

// Picker con ricerca per il tipo di comando di un Command - stesso Picker generico
// condiviso con gli altri picker server-driven (predicate, workflow, device...), qui
// alimentato da COMMAND_SCHEMA invece che da entita' live.
export interface CommandTypePickerProps {
  readonly schema: readonly CommandSchema[];
  readonly value: string;
  readonly onChange: (type: string) => void;
}

export function CommandTypePicker({ schema, value, onChange }: CommandTypePickerProps) {
  return (
    <Box sx={{ width: 260 }}>
      <Picker
        options={schema.map((s) => ({ id: s.type, primary: s.type, secondary: s.description }))}
        value={value || null}
        onChange={(type) => onChange(type ?? "")}
        label="command"
        placeholder="Cerca comando..."
      />
    </Box>
  );
}
