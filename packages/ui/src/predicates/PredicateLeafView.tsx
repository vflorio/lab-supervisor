import { Stack, Typography } from "@mui/material";
import type { PredicateLeaf } from "./ops";

// Readonly: "name" (ref) | "name == value" (equals) | "name includes value" (includes).
export interface PredicateLeafViewProps {
  readonly value: PredicateLeaf;
}

export function PredicateLeafView({ value }: PredicateLeafViewProps) {
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
