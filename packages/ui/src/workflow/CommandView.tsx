import { Chip, Stack, Typography } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Command } from "@supervisor/core/workflow/workflow";
import { DurationView } from "../duration/DurationView";
import { PredicateExpressionView } from "../predicates/PredicateExpressionView";

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
      <Chip label={value.type} size="small" color="primary" variant="outlined" sx={{ height: 18 }} />
      {fields.map((field) => {
        const raw = record[field.key];
        if (field.kind === "duration") return <DurationView key={field.key} value={raw as DurationString} />;
        if (field.kind === "predicate") {
          return <PredicateExpressionView key={field.key} value={raw as PredicateExpression} />;
        }
        if (field.kind === "coords") {
          const coords = raw as { x: number; y: number };
          return (
            <Typography key={field.key} variant="monoLabel" sx={{ color: "textSecondary" }}>
              ({coords.x}, {coords.y})
            </Typography>
          );
        }
        return (
          <Typography key={field.key} variant="monoLabel" sx={{ color: "textSecondary" }}>
            {String(raw)}
          </Typography>
        );
      })}
    </Stack>
  );
}
