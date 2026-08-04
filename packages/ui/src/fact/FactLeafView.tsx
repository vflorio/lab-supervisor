import { Stack, Typography } from "@mui/material";
import type { FactLeaf } from "./ops";

// Readonly: "name" (truthy) | "name == value" (equals) | "name includes value" (includes).
export interface FactLeafViewProps {
  readonly value: FactLeaf;
}

export function FactLeafView({ value }: FactLeafViewProps) {
  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value.name}
      </Typography>
      {value.type === "equals" && (
        <Typography variant="caption" color="textSecondary">
          == {String(value.value)}
        </Typography>
      )}
      {value.type === "includes" && (
        <Typography variant="caption" color="textSecondary">
          includes "{value.value}"
        </Typography>
      )}
    </Stack>
  );
}
