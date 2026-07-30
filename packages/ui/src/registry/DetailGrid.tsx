import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { StatusTone } from "./StatusPill";

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
          <Typography variant="overline" color="textSecondary">
            {item.label}
          </Typography>
          <Typography
            variant="emphasizedValue"
            sx={{ color: item.tone ? TONE_TEXT_COLOR[item.tone] : "text.primary" }}
          >
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
