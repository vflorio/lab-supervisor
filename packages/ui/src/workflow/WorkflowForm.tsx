import { Add, Delete, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { Button, IconButton, Stack, TextField } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command, Workflow } from "@supervisor/core/workflow/workflow";
import { CommandForm } from "./CommandForm";

// Form controllata per un Workflow: nome + array di Command, stessa meccanica
// (add/remove/sposta) di RetryPolicyForm sugli step di una PolicyJson.
export interface WorkflowFormProps {
  readonly value: Workflow;
  readonly onChange: (next: Workflow) => void;
  readonly schema: readonly CommandSchema[];
}

const defaultCommand = (schema: readonly CommandSchema[]): Command => {
  const first = schema[0];
  if (!first) return { type: "reboot" } as unknown as Command; // unreachable con schema non vuoto

  const record: Record<string, unknown> = { type: first.type };
  for (const field of first.fields) {
    record[field.key] =
      field.kind === "coords" ? { x: 0, y: 0 } : field.kind === "duration" ? ("0ms" as DurationString) : "";
  }
  return record as unknown as Command;
};

export function WorkflowForm({ value, onChange, schema }: WorkflowFormProps) {
  const updateCommand = (index: number, command: Command) =>
    onChange({ ...value, commands: value.commands.map((c, i) => (i === index ? command : c)) });

  const removeCommand = (index: number) =>
    onChange({ ...value, commands: value.commands.filter((_, i) => i !== index) });

  const moveCommand = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.commands.length) return;
    const next = [...value.commands];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...value, commands: next });
  };

  const addCommand = () => onChange({ ...value, commands: [...value.commands, defaultCommand(schema)] });

  return (
    <Stack sx={{ gap: 1.5 }}>
      <TextField
        size="small"
        label="name"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        sx={{ maxWidth: 280 }}
      />
      <Stack sx={{ gap: 1 }}>
        {value.commands.map((command, index) => (
          <Stack
            // biome-ignore lint/suspicious/noArrayIndexKey: comando controllato via value/onChange, nessun id
            key={index}
            direction="row"
            sx={{
              gap: 1,
              alignItems: "center",
              bgcolor: "#0a0c0e",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              px: 2,
              py: 1.5,
            }}
          >
            <CommandForm value={command} schema={schema} onChange={(next) => updateCommand(index, next)} />
            <div style={{ flexGrow: 1 }} />
            <IconButton size="small" onClick={() => moveCommand(index, -1)} disabled={index === 0}>
              <KeyboardArrowUp fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => moveCommand(index, 1)}
              disabled={index === value.commands.length - 1}
            >
              <KeyboardArrowDown fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => removeCommand(index)}>
              <Delete fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Add fontSize="small" />}
        onClick={addCommand}
        sx={{ alignSelf: "flex-start", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
      >
        Aggiungi step
      </Button>
    </Stack>
  );
}
