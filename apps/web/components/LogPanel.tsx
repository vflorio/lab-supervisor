import { ChevronLeft, ChevronRight, ClearAll, FilterAlt, Insights, Terminal } from "@mui/icons-material";
import { Box, IconButton, Tooltip } from "@mui/material";
import { ResizablePanel } from "@supervisor/ui/misc/ResizablePanel";
import { useLayoutEffect, useState } from "react";
import { useLogFeed } from "../hooks/useLogFeed";
import { useLogFilters } from "../hooks/useLogFilters";
import { PANEL_HEADER_HEIGHT, PanelHeader } from "../layout/PanelHeader";
import { LogFiltersPanel } from "./LogFiltersPanel";
import { LogViewport } from "./LogViewport";
import { OverviewPanel } from "./OverviewPanel";

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const RAIL_WIDTH = 40;
const WIDTH_STORAGE_KEY = "log-panel:width";
const COLLAPSED_STORAGE_KEY = "log-panel:collapsed";
const SECTION_STORAGE_KEY = "log-panel:section";

type Section = "logs" | "overview";

const SECTIONS: { readonly id: Section; readonly label: string; readonly icon: React.ReactNode }[] = [
  { id: "logs", label: "Service Logs", icon: <Terminal fontSize="small" /> },
  { id: "overview", label: "Overview", icon: <Insights fontSize="small" /> },
];

// Pannello globale (in +Layout.tsx, visibile su ogni pagina): un rail verticale fisso di
// bottoni-sezione (Service Logs, Overview) a destra della pagina, ridimensionabile trascinando
// il bordo sinistro del contenuto attivo. Rail sempre visibile - è lui, non il contenuto, a
// restare quando il pannello è collassato.
export function LogPanel() {
  const [collapsed, setCollapsedState] = useState(false);
  const [section, setSection] = useState<Section>("logs");

  // Idrata lo stato persistito solo dopo il mount (mai durante l'SSR): il primo render deve
  // combaciare esattamente con l'HTML del server (default false/"logs"), altrimenti React
  // segnala un hydration mismatch - stesso pattern della Sidebar.
  useLayoutEffect(() => {
    const rawCollapsed = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (rawCollapsed !== null) setCollapsedState(rawCollapsed === "true");
    const rawSection = window.localStorage.getItem(SECTION_STORAGE_KEY);
    if (rawSection === "logs" || rawSection === "overview") setSection(rawSection);
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  };

  const selectSection = (next: Section) => {
    setSection(next);
    window.localStorage.setItem(SECTION_STORAGE_KEY, next);
    if (collapsed) setCollapsed(false);
  };

  const [filtersOpen, setFiltersOpen] = useState(true);
  const { entries, status } = useLogFeed();
  const filters = useLogFilters(entries);

  const rowHeightKey = `${filters.minLevel}|${filters.search}|${[...filters.disabledTags].toSorted().join(",")}`;

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      <Box
        component="nav"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.5,
          pt: 1,
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {SECTIONS.map((s) => (
          <Tooltip key={s.id} title={s.label} placement="left">
            <IconButton
              size="small"
              onClick={() => selectSection(s.id)}
              color={!collapsed && section === s.id ? "primary" : "default"}
            >
              {s.icon}
            </IconButton>
          </Tooltip>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={collapsed ? "Expand" : "Collapse"}>
          <IconButton size="small" onClick={() => setCollapsed(!collapsed)} sx={{ mb: 1 }}>
            {collapsed ? <ChevronLeft fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      <ResizablePanel
        component="aside"
        handleSide="left"
        storageKey={WIDTH_STORAGE_KEY}
        defaultSize={DEFAULT_WIDTH}
        minSize={MIN_WIDTH}
        collapsed={collapsed}
        collapsedSize={0}
        sx={{
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {!collapsed && section === "logs" && (
          <LogViewport
            status={status}
            totalCount={entries.length}
            visibleCount={filters.visibleEntries.length}
            filteredEntries={filters.filteredEntries}
            hasActiveFilters={filters.hasActiveFilters}
            minLevel={filters.minLevel}
            showTimestamp={filters.showTimestamp}
            showTag={filters.showTag}
            rowHeightKey={rowHeightKey}
          />
        )}
        {!collapsed && section === "overview" && (
          <Box sx={{ position: "absolute", inset: 0, overflowY: "auto", pt: `${PANEL_HEADER_HEIGHT}px` }}>
            <OverviewPanel />
          </Box>
        )}
        {!collapsed && (
          <Box sx={{ position: "relative", zIndex: 1 }}>
            <PanelHeader
              icon={SECTIONS.find((s) => s.id === section)?.icon}
              title={SECTIONS.find((s) => s.id === section)?.label}
              sticky={false}
              px={1.5}
              actions={
                section === "logs" ? (
                  <>
                    <Tooltip title="Filters">
                      <IconButton
                        size="small"
                        onClick={() => setFiltersOpen((prev) => !prev)}
                        color={filtersOpen || filters.hasActiveFilters ? "primary" : "default"}
                      >
                        <FilterAlt fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Clear logs">
                      <IconButton
                        size="small"
                        onClick={filters.clearLogs}
                        disabled={filters.visibleEntries.length === 0}
                      >
                        <ClearAll fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : undefined
              }
            />
            {section === "logs" && filtersOpen && (
              <LogFiltersPanel
                search={filters.search}
                onSearchChange={filters.setSearch}
                availableTags={filters.availableTags}
                disabledTags={filters.disabledTags}
                onToggleTag={filters.toggleTag}
                anyTagDisabled={filters.anyTagDisabled}
                onToggleAllTags={filters.toggleAllTags}
                minLevel={filters.minLevel}
                onMinLevelChange={filters.setMinLevel}
                showTimestamp={filters.showTimestamp}
                onShowTimestampChange={filters.setShowTimestamp}
                showTag={filters.showTag}
                onShowTagChange={filters.setShowTag}
              />
            )}
          </Box>
        )}
      </ResizablePanel>
    </Box>
  );
}
