import { Box } from "@mui/material";
import type { ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Pillola di stato pura - stessa vocabolario a 5 toni già usato da ActivityColor
// (apps/web/components/ActivityStatus.tsx), tenuto qui come tipo indipendente: questo
// modulo non deve dipendere da apps/web. Nessuna logica, il chiamante decide label/tono/icona.
// -------------------------------------------------------------------------------------

export type StatusTone = "success" | "error" | "warning" | "info" | "disabled";

const TONE_COLORS: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: "success.main", fg: "success.contrastText" },
  error: { bg: "error.main", fg: "error.contrastText" },
  warning: { bg: "warning.main", fg: "warning.contrastText" },
  info: { bg: "info.main", fg: "info.contrastText" },
  disabled: { bg: "action.disabledBackground", fg: "text.disabled" },
};

export interface StatusPillProps {
  readonly label: string;
  readonly tone: StatusTone;
  readonly icon?: ReactNode;
}

export function StatusPill({ label, tone, icon }: StatusPillProps) {
  const { bg, fg } = TONE_COLORS[tone];

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: 999,
        bgcolor: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.8,
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
    </Box>
  );
}
