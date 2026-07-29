import { MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command } from "@supervisor/core/workflow/workflow";
import { DurationForm } from "../duration/DurationForm";

// Form controllata per un singolo Command. Lo schema (quali comandi esistono, che campi
// hanno) e' iniettato dal chiamante - vedi @supervisor/core/workflow/codec#COMMAND_SCHEMA -
// nessun tipo di comando hardcoded qui dentro.
export interface CommandFormProps {
  readonly value: Command;
  readonly onChange: (next: Command) => void;
  readonly schema: readonly CommandSchema[];
}

const defaultFieldValue = (kind: CommandSchema["fields"][number]["kind"]): unknown =>
  kind === "duration" ? ("0ms" as DurationString) : kind === "coords" ? { x: 0, y: 0 } : "";

const commandFor = (schema: readonly CommandSchema[], type: string): Command => {
  const found = schema.find((s) => s.type === type) ?? schema[0];
  if (!found) return { type } as unknown as Command;

  const record: Record<string, unknown> = { type: found.type };
  for (const field of found.fields) record[field.key] = defaultFieldValue(field.kind);
  return record as unknown as Command;
};

export function CommandForm({ value, onChange, schema }: CommandFormProps) {
  const commandSchema = schema.find((s) => s.type === value.type);
  const record = value as unknown as Record<string, unknown>;
  const setField = (key: string, next: unknown) => onChange({ ...record, [key]: next } as unknown as Command);

  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Select
        size="small"
        value={value.type}
        onChange={(event: SelectChangeEvent) => onChange(commandFor(schema, event.target.value))}
        sx={{ minWidth: 180 }}
      >
        {schema.map((s) => (
          <MenuItem key={s.type} value={s.type}>
            {s.type}
          </MenuItem>
        ))}
      </Select>
      {commandSchema?.fields.map((field) => {
        const raw = record[field.key];

        if (field.kind === "duration") {
          return (
            <DurationForm
              key={field.key}
              label={field.label}
              value={typeof raw === "string" ? (raw as DurationString) : "0ms"}
              onChange={(next) => setField(field.key, next)}
            />
          );
        }

        if (field.kind === "coords") {
          const coords = (raw as { x: number; y: number } | undefined) ?? { x: 0, y: 0 };
          return (
            <Stack key={field.key} direction="row" sx={{ gap: 1 }}>
              <TextField
                size="small"
                type="number"
                label="x"
                value={coords.x}
                onChange={(event) => setField(field.key, { ...coords, x: Number(event.target.value) })}
                sx={{ width: 80 }}
              />
              <TextField
                size="small"
                type="number"
                label="y"
                value={coords.y}
                onChange={(event) => setField(field.key, { ...coords, y: Number(event.target.value) })}
                sx={{ width: 80 }}
              />
            </Stack>
          );
        }

        return (
          <TextField
            key={field.key}
            size="small"
            label={field.label}
            value={typeof raw === "string" ? raw : ""}
            onChange={(event) => setField(field.key, event.target.value)}
            sx={{ width: 160 }}
          />
        );
      })}
    </Stack>
  );
}
