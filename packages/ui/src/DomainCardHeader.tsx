import { Code } from "@mui/icons-material";
import { Box, Stack, Switch, Typography } from "@mui/material";
import type { ReactNode } from "react";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Header comune a ogni card di dominio (config domain): icona + eyebrow "config domain" +
// titolo/sottotitolo, azioni del chiamante (es. Modifica/Salva/Annulla) + toggle JSON.
// Un solo componente riusato da ogni card di settings invece di ridisegnarlo per dominio.
export interface DomainCardHeaderProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly showJson: boolean;
  readonly onToggleJson: () => void;
  readonly actions?: ReactNode;
}

export function DomainCardHeader({ icon, title, subtitle, showJson, onToggleJson, actions }: DomainCardHeaderProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 2.5 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center" }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            bgcolor: "rgba(74,222,128,0.1)",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography
            sx={{
              ...mono,
              fontSize: 10,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              mb: 0.25,
            }}
          >
            config domain
          </Typography>
          <Typography sx={{ ...mono, fontSize: 13, fontWeight: 600, color: "text.primary", lineHeight: 1 }}>
            {title}
          </Typography>
          {subtitle && <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>{subtitle}</Typography>}
        </Box>
      </Stack>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
        {actions}
        <Stack direction="row" sx={{ gap: 0.5, alignItems: "center" }}>
          <Typography sx={{ ...mono, fontSize: 11, color: "text.secondary" }}>JSON</Typography>
          <Switch checked={showJson} onChange={onToggleJson} size="small" color="primary" />
          <Code sx={{ fontSize: 14, color: showJson ? "primary.main" : "text.secondary" }} />
        </Stack>
      </Stack>
    </Stack>
  );
}
