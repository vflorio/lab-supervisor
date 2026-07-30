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
  // Un widget per loop, non un aggregato: quando un dominio ne espone più d'uno (Suitest: 3
  // pollings indipendenti, Recovery: uno per policy) sono N voci in questa stessa lista, ognuna
  // già "titolata" dal proprio `label` (es. "Suitest · cameras", "Recovery · <policy>") - nessun
  // widget speciale che li raggruppa. Una pagina dedicata potrà in futuro renderizzare la stessa
  // lista altrove, senza bisogno di un tipo diverso.
  readonly loops: readonly LoopWidgetProps[];
}

// I vital sign del servizio in cima alla pagina registry: stato della connessione live piu'
// i loop di background che alimentano i predicati/attivita' mostrati sotto.
export function ServiceStrip({ connection, loops }: ServiceStripProps) {
  return (
    <Box sx={{ borderBottom: "1px solid", borderColor: "divider", px: 3, py: 2 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center", mb: 1.5 }}>
        <Typography variant="monoEyebrow" color="textSecondary">
          Lab Supervisor
        </Typography>
        <StatusPill label={connection} tone={CONNECTION_TONE[connection]} />
      </Stack>
      <Stack direction="row" sx={{ gap: 1.5, overflowX: "auto", pb: 0.5 }}>
        {loops.map((loop) => (
          <LoopWidget key={loop.id} {...loop} />
        ))}
      </Stack>
    </Box>
  );
}
