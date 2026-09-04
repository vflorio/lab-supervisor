import { Box, Stack, Typography } from "@mui/material";
import { StatusPill, type StatusTone } from "../registry/StatusPill";
import { LoopWidget, type LoopWidgetProps } from "./LoopWidget";
import type { ServiceConnection } from "./types";

const CONNECTION_TONE: Record<ServiceConnection, StatusTone> = {
  online: "success",
  connecting: "warning",
  reconnecting: "warning",
};

export interface ServiceStripProps {
  readonly connection: ServiceConnection;
  readonly loops: readonly LoopWidgetProps[];
  readonly version?: string;
  readonly actions?: React.ReactNode;
}

// I vital sign del servizio: stato della connessione live piu' i loop di background che
// alimentano i predicati/attivita' mostrati in registry. Vive nel pannello Overview
// (apps/web/components/OverviewPanel.tsx), quindi in colonna piuttosto che in riga.
// `actions` ospita controlli impuri (es. restart ADB server) composti dal chiamante:
// il componente resta puro, senza mai chiamare trpc direttamente.
export function ServiceStrip({ connection, loops, version, actions }: ServiceStripProps) {
  return (
    <Box sx={{ px: 1.5, py: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Stack direction="row" sx={{ gap: 1.5, alignItems: "center" }}>
          <Typography variant="monoEyebrow" color="textSecondary">
            tRPC
          </Typography>
          <StatusPill label={connection} tone={CONNECTION_TONE[connection]} />
          {version && (
            <Typography variant="caption" color="text.secondary">
              v{version}
            </Typography>
          )}
        </Stack>
        {actions}
      </Stack>
      <Stack sx={{ gap: 1.5 }}>
        {loops.map((loop) => (
          <LoopWidget key={loop.id} {...loop} />
        ))}
      </Stack>
    </Box>
  );
}
