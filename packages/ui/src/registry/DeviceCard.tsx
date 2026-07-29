import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Card di device pura, due righe: riga A = icona + titolo/sottotitolo + pill di stato;
// riga B = descrizione + azioni. Nessun handler/stato proprio - ogni zona è già un
// ReactNode pronto passato dal chiamante (stessa convenzione a slot di EntryRow, vedi
// packages/ui/src/EntryRow.tsx), niente logica o tipi di dominio qui dentro.
// -------------------------------------------------------------------------------------

export interface DeviceCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly status?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

export function DeviceCard({ icon, title, subtitle, status, description, actions }: DeviceCardProps) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        bgcolor: "background.paper",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5 }}>
        <Box sx={{ color: "textSecondary", display: "flex", pt: 0.5, flexShrink: 0 }}>{icon}</Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="textSecondary" noWrap sx={{ display: "block" }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {status && <Box sx={{ flexShrink: 0 }}>{status}</Box>}
      </Stack>

      {(description || actions) && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            {description && (
              <Typography variant="caption" color="textSecondary" noWrap sx={{ display: "block" }}>
                {description}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack direction="row" sx={{ flexShrink: 0, gap: 1 }}>
              {actions}
            </Stack>
          )}
        </Stack>
      )}
    </Box>
  );
}
