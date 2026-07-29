import { Box, Stack, Typography } from "@mui/material";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const DOTS = ["#ef4444", "#f59e0b", "#4ade80"];

// Riquadro terminal-style per il toggle JSON di una DomainCardHeader: stesso sfondo scuro
// annidato (#0a0c0e) usato da ScheduleGrid/CommandView per isolare i layer di dati.
export interface JsonViewProps {
  readonly data: unknown;
}

export function JsonView({ data }: JsonViewProps) {
  return (
    <Box sx={{ bgcolor: "#0a0c0e", border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          gap: 0.5,
          alignItems: "center",
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "#0d0f11",
        }}
      >
        {DOTS.map((color) => (
          <Box key={color} sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: color, opacity: 0.7 }} />
        ))}
        <Typography sx={{ ...mono, fontSize: 10, color: "text.secondary", ml: 0.5 }}>JSON</Typography>
      </Stack>
      <Box
        component="pre"
        sx={{ ...mono, fontSize: 11, color: "primary.main", p: 2, m: 0, overflowX: "auto", lineHeight: 1.7 }}
      >
        {JSON.stringify(data, null, 2)}
      </Box>
    </Box>
  );
}
