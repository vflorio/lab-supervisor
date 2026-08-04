import { ChevronLeft, ChevronRight, ClearAll, FilterAlt, Terminal } from "@mui/icons-material";
import { Box, IconButton, Tooltip } from "@mui/material";
import { ResizablePanel } from "@supervisor/ui/misc/ResizablePanel";
import { useLayoutEffect, useState } from "react";
import { useLogFeed } from "../hooks/useLogFeed";
import { useLogFilters } from "../hooks/useLogFilters";
import { PANEL_HEADER_HEIGHT, PanelHeader } from "../layout/PanelHeader";
import { LogFiltersPanel } from "./LogFiltersPanel";
import { LogViewport } from "./LogViewport";

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const WIDTH_STORAGE_KEY = "log-panel:width";
const COLLAPSED_STORAGE_KEY = "log-panel:collapsed";

// Pannello log globale (in +Layout.tsx, visibile su ogni pagina), ridimensionabile
// trascinando il bordo sinistro - la dimensione scelta dall'utente persiste tra le sessioni
// (ResizablePanel), quindi nessun limite massimo: il controllo è delegato all'utente.
export function LogPanel() {
  const [collapsed, setCollapsedState] = useState(false);

  // Idrata lo stato persistito solo dopo il mount (mai durante l'SSR): il primo render deve
  // combaciare esattamente con l'HTML del server (default false), altrimenti React segnala un
  // hydration mismatch - stesso pattern della Sidebar.
  useLayoutEffect(() => {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (raw !== null) setCollapsedState(raw === "true");
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  };

  const [filtersOpen, setFiltersOpen] = useState(true);
  const { entries, status } = useLogFeed();
  const filters = useLogFilters(entries);

  const rowHeightKey = `${filters.minLevel}|${filters.search}|${[...filters.disabledTags].toSorted().join(",")}`;

  return (
    <ResizablePanel
      component="aside"
      handleSide="left"
      storageKey={WIDTH_STORAGE_KEY}
      defaultSize={DEFAULT_WIDTH}
      minSize={MIN_WIDTH}
      collapsed={collapsed}
      collapsedSize={PANEL_HEADER_HEIGHT}
      sx={{
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {!collapsed && (
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
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <PanelHeader
          icon={collapsed ? undefined : <Terminal sx={{ fontSize: 16 }} />}
          title={collapsed ? undefined : "Service Logs"}
          sticky={false}
          px={1.5}
          actions={
            <>
              {!collapsed && (
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
                    <span>
                      <IconButton
                        size="small"
                        onClick={filters.clearLogs}
                        disabled={filters.visibleEntries.length === 0}
                      >
                        <ClearAll fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
              <Tooltip title={collapsed ? "Expand" : "Collapse"}>
                <IconButton size="small" onClick={() => setCollapsed(!collapsed)}>
                  {collapsed ? <ChevronLeft fontSize="small" /> : <ChevronRight fontSize="small" />}
                </IconButton>
              </Tooltip>
            </>
          }
        />
        {!collapsed && filtersOpen && (
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
    </ResizablePanel>
  );
}
