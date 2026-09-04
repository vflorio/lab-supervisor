import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Box, Divider, IconButton, List, ListItemButton, ListItemIcon, Tooltip } from "@mui/material";
import { ResizablePanel } from "@supervisor/ui/misc/ResizablePanel";
import type { ReactNode } from "react";
import { PANEL_HEADER_HEIGHT, PanelHeader, panelHeaderIconSx } from "./PanelHeader";

// Stessa larghezza della Sidebar collassata (vedi Sidebar.tsx) - i due rail verticali dell'app
// restano allineati invece di avere due misure diverse.
const RAIL_WIDTH = PANEL_HEADER_HEIGHT;

export interface SidePanelSection {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  // Layer di sfondo della sezione, a piena altezza dietro l'header vetro-smerigliato (vedi
  // PanelHeader) - ogni sezione decide da sé se riempire assoluto (es. lista virtualizzata che
  // scrolla sotto l'header) o scrollare normalmente sotto un padding-top.
  readonly content: ReactNode;
  // Azioni mostrate sulla riga dell'header (es. i toggle Filters/Clear della log view).
  readonly actions?: ReactNode;
  // Chrome aggiuntivo "galleggiante" sotto l'header, nello stesso layer in primo piano (es. il
  // pannello filtri della log view quando aperto) - non fa parte del contenuto scrollabile.
  readonly chromeContent?: ReactNode;
}

export interface SidePanelProps {
  readonly sections: readonly SidePanelSection[];
  readonly activeSectionId: string;
  readonly onSelectSection: (id: string) => void;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: (collapsed: boolean) => void;
  // Chiave localStorage per la larghezza (vedi ResizablePanel) - collapsed/sezione attiva sono a
  // carico del chiamante, così il guscio resta agnostico rispetto alla persistenza.
  readonly widthStorageKey: string;
  readonly defaultWidth?: number;
  readonly minWidth?: number;
}

// Guscio generico di un pannello laterale a rail: strip verticale di sezioni sempre visibile
// (stesso stile della Sidebar collassata) più contenuto ridimensionabile trascinando il bordo
// sinistro. Non sa nulla di cosa contiene ogni sezione (log, overview, o altro in futuro) - solo
// come selezionarle, collassarle e ridimensionarle.
export function SidePanel({
  sections,
  activeSectionId,
  onSelectSection,
  collapsed,
  onToggleCollapsed,
  widthStorageKey,
  defaultWidth = 340,
  minWidth = 220,
}: SidePanelProps) {
  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      <Box
        component="nav"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            height: PANEL_HEADER_HEIGHT,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 1,
          }}
        >
          <IconButton size="small" onClick={() => onToggleCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronLeft fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
        </Box>
        <Divider />
        <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {sections.map((s) => {
            const isActive = !collapsed && s.id === activeSectionId;
            return (
              <Tooltip key={s.id} title={s.label} placement="left">
                <ListItemButton
                  selected={isActive}
                  onClick={() => {
                    onSelectSection(s.id);
                    if (collapsed) onToggleCollapsed(false);
                  }}
                  sx={{
                    justifyContent: "center",
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      "&:hover": { bgcolor: "primary.main" },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, justifyContent: "center" }}>
                    <Box sx={{ ...panelHeaderIconSx, ...(isActive && { bgcolor: "rgba(0,0,0,0.8)" }) }}>{s.icon}</Box>
                  </ListItemIcon>
                </ListItemButton>
              </Tooltip>
            );
          })}
        </List>
      </Box>

      <ResizablePanel
        component="aside"
        handleSide="left"
        storageKey={widthStorageKey}
        defaultSize={defaultWidth}
        minSize={minWidth}
        collapsed={collapsed}
        collapsedSize={0}
        sx={{
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {!collapsed && activeSection && activeSection.content}
        {!collapsed && activeSection && (
          <Box sx={{ position: "relative", zIndex: 1 }}>
            <PanelHeader
              icon={activeSection.icon}
              title={activeSection.label}
              sticky={false}
              px={1.5}
              actions={activeSection.actions}
            />
            {activeSection.chromeContent}
          </Box>
        )}
      </ResizablePanel>
    </Box>
  );
}
