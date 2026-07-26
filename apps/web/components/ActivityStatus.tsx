import { Box, Stack, Typography } from "@mui/material";
import type { ActivitySource } from "@supervisor/core/activity/model";
import { activityKey } from "@supervisor/core/activity/model";
import type { ReactNode } from "react";
import { useActivity } from "../hooks/useActivity";

// -------------------------------------------------------------------------------------
// "Cosa sta facendo un sottosistema per questa entità adesso" (vedi Activity.ActivityEntry) -
// per la colonna `context` di EntryRow (stessa forma visiva della "Assigned ADB" già usata
// lì): icona colorata in base allo stato + label/valore. Nessuna entry ancora presente per
// (source, entityId) è uno stato legittimo ("idle"), non un errore - la entity potrebbe
// semplicemente non aver ancora generato attività di quel tipo.
// -------------------------------------------------------------------------------------

export type ActivityColor = "success" | "error" | "warning" | "info" | "disabled";

const STATE_COLOR: Record<ActivityColor, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface ActivityStatusProps {
  readonly source: ActivitySource;
  readonly entityId: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly colorFor: (status: string | undefined) => ActivityColor;
  readonly detail?: (status: string | undefined) => string;
}

export function ActivityStatus({ source, entityId, label, icon, colorFor, detail }: ActivityStatusProps) {
  const { table } = useActivity();
  const entry = table.get(activityKey({ source, entityId }));
  const detailText = detail ? detail(entry?.status) : (entry?.status ?? "idle");

  return (
    <Stack sx={{ flexDirection: "row", gap: 1, alignItems: "center", minWidth: 0 }}>
      <Box sx={{ color: STATE_COLOR[colorFor(entry?.status)], display: "flex", flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="textSecondary" noWrap sx={{ display: "block" }}>
          {detailText}
        </Typography>
      </Box>
    </Stack>
  );
}
