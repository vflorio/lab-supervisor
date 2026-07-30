import { Stack, TextField } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command } from "@supervisor/core/workflow/workflow";
import { match } from "ts-pattern";
import { DurationForm } from "../duration/DurationForm";
import { FieldLabel } from "../misc/FieldLabel";
import { NumberField } from "../misc/number-field/NumberField";
import { CommandTypePicker } from "./CommandTypePicker";

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
      <CommandTypePicker schema={schema} value={value.type} onChange={(type) => onChange(commandFor(schema, type))} />
      {commandSchema?.fields.map((field) => {
        const raw = record[field.key];
        return match(field)
          .with({ kind: "duration" }, () => (
            <DurationForm
              key={field.key}
              label={field.label}
              value={typeof raw === "string" ? (raw as DurationString) : "0ms"}
              onChange={(next) => setField(field.key, next)}
            />
          ))
          .with({ kind: "coords" }, () => {
            const { x, y } = (raw as { x: number; y: number }) ?? { x: 0, y: 0 };
            return (
              <Stack key={field.key} direction="row" sx={{ gap: 1 }}>
                <NumberField label="x" value={x} onChange={(next) => setField(field.key, { x: next, y })} width={80} />
                <NumberField label="y" value={y} onChange={(next) => setField(field.key, { x, y: next })} width={80} />
              </Stack>
            );
          })
          .otherwise(() => (
            <TextField
              label={field.label}
              size="small"
              value={typeof raw === "string" ? raw : ""}
              onChange={(event) => setField(field.key, event.target.value)}
            />
          ));
      })}
    </Stack>
  );
}
