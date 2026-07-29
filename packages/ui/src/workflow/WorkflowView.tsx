import { Stack, Typography } from "@mui/material";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { CommandView } from "./CommandView";

// Readonly: nome + lista ordinata di comandi.
export interface WorkflowViewProps {
  readonly value: Workflow;
  readonly schema: readonly CommandSchema[];
}

export function WorkflowView({ value, schema }: WorkflowViewProps) {
  return (
    <Stack sx={{ gap: 0.75 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {value.name}
      </Typography>
      {value.commands.map((command, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Command non ha id, sola lettura
        <CommandView key={index} value={command} schema={schema} />
      ))}
    </Stack>
  );
}
