import { alpha, Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Altezza fissa dell'header: stesso "modulo" verticale riusato dalla Sidebar (collassata,
// vedi Sidebar.tsx) per restare allineata in tutta l'app invece di dipendere da un padding
// variabile per-pannello.
export const PANEL_HEADER_HEIGHT = 56;
const ICON_BOX_SIZE = 28;

// Stile del box icona, riusato anche dalle voci di navigazione della Sidebar così le due
// zone condividono lo stesso "chip" visivo.
export const panelHeaderIconSx = {
  width: ICON_BOX_SIZE,
  height: ICON_BOX_SIZE,
  flexShrink: 0,
  borderRadius: 1,
  bgcolor: "rgba(74,222,128,0.1)",
  color: "primary.main",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

export interface PanelHeaderProps {
  readonly title?: ReactNode;
  readonly icon?: ReactNode;
  readonly actions?: ReactNode;
  // `false` per un pannello che non è mai il contenitore scrollabile (es. LogPanel, dove solo
  // il viewport dei log sotto l'header scrolla) - l'header resta comunque fisso in cima al suo
  // flex column, "sticky" non aggiungerebbe nulla lì. Default true per Panel (vedi Panel.tsx).
  readonly sticky?: boolean;
  // Padding orizzontale dell'header - default pensato per #page-content (viewport-wide),
  // i pannelli più stretti (es. LogPanel, ridimensionabile) passano un valore fisso più contenuto.
  readonly px?: number | { xs: number; md: number };
}

// Header traslucido riusato da Panel (pagine) e LogPanel: stesso icon-box/mono di
// DomainCardHeader, blur "vetro smerigliato" coerente in tutta l'app invece di reinventarlo
// per ogni pannello.
export function PanelHeader({ title, icon, actions, sticky = true, px = { xs: 2, md: 4 } }: PanelHeaderProps) {
  if (!title && !icon && !actions) return null;

  return (
    <Box
      component="header"
      sx={{
        ...(sticky ? { position: "sticky", top: 0, zIndex: (t) => t.zIndex.appBar } : {}),
        height: PANEL_HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        px,
        bgcolor: (t) => alpha(t.palette.background.paper, 0.72),
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      {title || icon ? (
        <Stack direction="row" sx={{ gap: 1.5, alignItems: "center", minWidth: 0 }}>
          {icon && <Box sx={panelHeaderIconSx}>{icon}</Box>}
          {title && (
            <Typography noWrap sx={{ ...mono, fontSize: 14, fontWeight: 600, color: "text.primary" }}>
              {title}
            </Typography>
          )}
        </Stack>
      ) : null}
      {actions && (
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Box>
  );
}
