import { Box } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import { monoFontFamily } from "../theme";

export interface DurationViewProps {
  readonly value: DurationString;
}

export function DurationView({ value }: DurationViewProps) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        px: 1,
        py: 0.5,
        borderRadius: 999,
        border: "1px solid",
        borderColor: "divider",
        fontFamily: monoFontFamily,
        fontSize: 12,
        color: "text.primary",
      }}
    >
      {value}
    </Box>
  );
}
