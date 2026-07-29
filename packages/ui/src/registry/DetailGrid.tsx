import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { StatusTone } from "./StatusPill";

// Griglia di coppie label/value, tono colorato in base allo StatusTone del chiamante.
export interface DetailItem {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: StatusTone;
}

const TONE_TEXT_COLOR: Record<StatusTone, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface DetailGridProps {
  readonly items: readonly DetailItem[];
}

export function DetailGrid({ items }: DetailGridProps) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 1.5 }}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: DetailItem non ha id, sola lettura
        <Box key={index}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              fontSize: "0.65rem",
              lineHeight: 1.4,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {item.label}
          </Typography>
          <Typography
            sx={{
              display: "block",
              fontSize: "0.8rem",
              lineHeight: 1.4,
              fontWeight: 700,
              color: item.tone ? TONE_TEXT_COLOR[item.tone] : "text.primary",
            }}
          >
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
