import { Add } from "@mui/icons-material";
import { Button, Stack, TextField } from "@mui/material";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command, Workflow } from "@supervisor/core/workflow/workflow";
import { DomainSortable } from "../misc/DomainSortable";
import { moveAt, removeAt } from "../misc/sortable";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { CommandForm, commandFor } from "./CommandForm";

export interface WorkflowFormProps {
  readonly value: Workflow;
  readonly onChange: (next: Workflow) => void;
  readonly schema: readonly CommandSchema[];
  readonly predicateOptions?: readonly PredicateOption[];
}

const defaultCommand = (schema: readonly CommandSchema[]): Command => {
  const first = schema[0];
  if (!first) return { type: "reboot" } as unknown as Command; // unreachable con schema non vuoto

  return commandFor(schema, first.type);
};

export function WorkflowForm({ value, onChange, schema, predicateOptions }: WorkflowFormProps) {
  const updateCommand = (index: number, command: Command) =>
    onChange({ ...value, commands: value.commands.map((c, i) => (i === index ? command : c)) });

  const removeCommand = (index: number) => onChange({ ...value, commands: removeAt<Command>(index)(value.commands) });

  const moveCommand = (index: number, delta: number) =>
    onChange({ ...value, commands: moveAt<Command>(index, delta)(value.commands) });

  const addCommand = () => onChange({ ...value, commands: [...value.commands, defaultCommand(schema)] });

  return (
    <Stack sx={{ gap: 1, py: 1 }}>
      <TextField
        label="name"
        size="small"
        fullWidth
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
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
              py: 2,
            }}
          >
            <CommandForm
              value={command}
              schema={schema}
              predicateOptions={predicateOptions}
              onChange={(next) => updateCommand(index, next)}
            />
            <DomainSortable
              index={index}
              length={value.commands.length}
              onMove={(delta) => moveCommand(index, delta)}
              onRemove={() => removeCommand(index)}
            />
          </Stack>
        ))}
      </Stack>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Add fontSize="small" />}
        onClick={addCommand}
        sx={{ alignSelf: "flex-start" }}
      >
        Aggiungi step
      </Button>
    </Stack>
  );
}
