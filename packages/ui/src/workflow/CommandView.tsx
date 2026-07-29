import { Chip, Stack, Typography } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command } from "@supervisor/core/workflow/workflow";
import { DurationView } from "../duration/DurationView";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Readonly: badge "type field field ...", riusa DurationView per il campo duration. Il badge
// su sfondo scuro è lo stesso layer visivo usato per isolare item annidati (vedi ScheduleGrid).
export interface CommandViewProps {
  readonly value: Command;
  readonly schema: readonly CommandSchema[];
}

export function CommandView({ value, schema }: CommandViewProps) {
  const record = value as unknown as Record<string, unknown>;
  const fields = schema.find((s) => s.type === value.type)?.fields ?? [];

  return (
    <Stack
      direction="row"
      sx={{
        gap: 0.75,
        alignItems: "center",
        flexWrap: "wrap",
        flex: 1,
        bgcolor: "#0a0c0e",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        px: 1.25,
        py: 0.75,
      }}
    >
      <Chip
        label={value.type}
        size="small"
        color="info"
        sx={{ ...mono, fontSize: 10, height: 18, borderRadius: "4px" }}
      />
      {fields.map((field) => {
        const raw = record[field.key];
        if (field.kind === "duration") return <DurationView key={field.key} value={raw as DurationString} />;
        if (field.kind === "coords") {
          const coords = raw as { x: number; y: number };
          return (
            <Typography key={field.key} sx={{ ...mono, fontSize: 10, color: "text.secondary" }}>
              ({coords.x}, {coords.y})
            </Typography>
          );
        }
        return (
          <Typography key={field.key} sx={{ ...mono, fontSize: 10, color: "text.secondary" }}>
            {String(raw)}
          </Typography>
        );
      })}
    </Stack>
  );
}
