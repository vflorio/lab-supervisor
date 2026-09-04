import { Insights, Terminal } from "@mui/icons-material";
import { Box } from "@mui/material";
import { booleanCodec, type PersistedStateCodec, usePersistedState } from "@supervisor/ui/misc/usePersistedState";
import { useLogFeed } from "../hooks/useLogFeed";
import { PANEL_HEADER_HEIGHT } from "../layout/PanelHeader";
import { SidePanel, type SidePanelSection } from "../layout/SidePanel";
import { LogFiltersPanel } from "./log-panel/LogFiltersPanel";
import { LogViewActions } from "./log-panel/LogViewActions";
import { LogViewport } from "./log-panel/LogViewport";
import { useLogView } from "./log-panel/useLogView";
import { OverviewPanel } from "./OverviewPanel";

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const WIDTH_STORAGE_KEY = "log-panel:width";
const COLLAPSED_STORAGE_KEY = "log-panel:collapsed";
const SECTION_STORAGE_KEY = "log-panel:section";

type Section = "logs" | "overview";

const sectionCodec: PersistedStateCodec<Section> = {
  serialize: (value) => value,
  deserialize: (raw) => (raw === "logs" || raw === "overview" ? raw : undefined),
};

// Pannello globale (in +Layout.tsx, visibile su ogni pagina): composition root che monta il
// guscio generico SidePanel con le sezioni Service Logs / Overview. Persistenza (collassato,
// sezione attiva) e dati (useLogFeed) vivono qui - il rendering del guscio e degli atomi della
// log view sono demandati rispettivamente a layout/SidePanel e components/log-panel.
export function LogPanel() {
  const [collapsed, setCollapsed] = usePersistedState(COLLAPSED_STORAGE_KEY, false, booleanCodec);
  const [section, setSection] = usePersistedState<Section>(SECTION_STORAGE_KEY, "logs", sectionCodec);

  const { entries, status } = useLogFeed();
  const logView = useLogView(entries);

  const sections: SidePanelSection[] = [
    {
      id: "overview",
      label: "Overview",
      icon: <Insights fontSize="small" />,
      content: (
        <Box sx={{ position: "absolute", inset: 0, overflowY: "auto", pt: `${PANEL_HEADER_HEIGHT}px` }}>
          <OverviewPanel />
        </Box>
      ),
    },
    {
      id: "logs",
      label: "Service Logs",
      icon: <Terminal fontSize="small" />,
      actions: (
        <LogViewActions
          filtersOpen={logView.filtersOpen}
          onToggleFilters={logView.toggleFilters}
          hasActiveFilters={logView.filters.hasActiveFilters}
          onClear={logView.filters.clearLogs}
          canClear={logView.filters.visibleEntries.length > 0}
        />
      ),
      chromeContent: logView.filtersOpen && (
        <LogFiltersPanel
          search={logView.filters.search}
          onSearchChange={logView.filters.setSearch}
          availableTags={logView.filters.availableTags}
          disabledTags={logView.filters.disabledTags}
          onToggleTag={logView.filters.toggleTag}
          anyTagDisabled={logView.filters.anyTagDisabled}
          onToggleAllTags={logView.filters.toggleAllTags}
          minLevel={logView.filters.minLevel}
          onMinLevelChange={logView.filters.setMinLevel}
          showTimestamp={logView.filters.showTimestamp}
          onShowTimestampChange={logView.filters.setShowTimestamp}
          showTag={logView.filters.showTag}
          onShowTagChange={logView.filters.setShowTag}
        />
      ),
      content: (
        <LogViewport
          status={status}
          totalCount={entries.length}
          visibleCount={logView.filters.visibleEntries.length}
          filteredEntries={logView.filters.filteredEntries}
          hasActiveFilters={logView.filters.hasActiveFilters}
          minLevel={logView.filters.minLevel}
          showTimestamp={logView.filters.showTimestamp}
          showTag={logView.filters.showTag}
          rowHeightKey={logView.rowHeightKey}
        />
      ),
    },
  ];

  return (
    <SidePanel
      sections={sections}
      activeSectionId={section}
      onSelectSection={(id) => setSection(id as Section)}
      collapsed={collapsed}
      onToggleCollapsed={setCollapsed}
      widthStorageKey={WIDTH_STORAGE_KEY}
      defaultWidth={DEFAULT_WIDTH}
      minWidth={MIN_WIDTH}
    />
  );
}
