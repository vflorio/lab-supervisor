import { Stack, Typography } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command } from "@supervisor/core/workflow/workflow";
import { DurationView } from "../duration/DurationView";

// Readonly: "type field field ...", riusa DurationView per il campo duration.
export interface CommandViewProps {
  readonly value: Command;
  readonly schema: readonly CommandSchema[];
}

export function CommandView({ value, schema }: CommandViewProps) {
  const record = value as unknown as Record<string, unknown>;
  const fields = schema.find((s) => s.type === value.type)?.fields ?? [];

  return (
    <Stack direction="row" sx={{ gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value.type}
      </Typography>
      {fields.map((field) => {
        const raw = record[field.key];
        if (field.kind === "duration") return <DurationView key={field.key} value={raw as DurationString} />;
        if (field.kind === "coords") {
          const coords = raw as { x: number; y: number };
          return (
            <Typography key={field.key} variant="caption" color="text.secondary">
              ({coords.x}, {coords.y})
            </Typography>
          );
        }
        return (
          <Typography key={field.key} variant="caption" color="text.secondary">
            {String(raw)}
          </Typography>
        );
      })}
    </Stack>
  );
}
