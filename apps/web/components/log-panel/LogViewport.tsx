import { KeyboardArrowDown } from "@mui/icons-material";
import { Box, Fab, Typography } from "@mui/material";
import type { LogEntry } from "@supervisor/core/logger/log-stream";
import type { LogLevel } from "@supervisor/core/logger/logger";
import { List, useDynamicRowHeight } from "react-window";
import type { ServiceStatus } from "../../hooks/useLogFeed";
import { PANEL_HEADER_HEIGHT } from "../../layout/PanelHeader";
import { LogRow } from "./LogRow";
import { useStickToBottom } from "./useStickToBottom";

const VIEWPORT_BG = "#0a0c0e";
const DEFAULT_ROW_HEIGHT = 20;

export interface LogViewportProps {
  readonly status: ServiceStatus;
  readonly totalCount: number;
  readonly visibleCount: number;
  readonly filteredEntries: readonly LogEntry[];
  readonly hasActiveFilters: boolean;
  readonly minLevel: LogLevel;
  readonly showTimestamp: boolean;
  readonly showTag: boolean;
  readonly rowHeightKey: string;
}

export function LogViewport({
  status,
  totalCount,
  visibleCount,
  filteredEntries,
  hasActiveFilters,
  minLevel,
  showTimestamp,
  showTag,
  rowHeightKey,
}: LogViewportProps) {
  // La cache di useDynamicRowHeight è per indice, non per entry: al cambio di filtro gli stessi
  // indici puntano a entry diverse e le altezze misurate non valgono più. La chiave la scarta.
  // Timestamp e tag ne fanno parte perché sono prefissi che spostano il punto di a-capo.
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    key: `${rowHeightKey}|${showTimestamp}|${showTag}`,
  });
  const { listRef, stuckToBottom, scrollToBottom } = useStickToBottom();

  return (
    <Box sx={{ position: "absolute", inset: 0 }}>
      <Box
        sx={{
          height: "100%",
          bgcolor: VIEWPORT_BG,
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {totalCount === 0 && (
          <Typography variant="body2" color="textSecondary" sx={{ p: 1.5, pt: `${PANEL_HEADER_HEIGHT + 12}px` }}>
            {status === "online" ? "Waiting for logs…" : "Connecting to service…"}
          </Typography>
        )}
        {totalCount > 0 && visibleCount === 0 && (
          <Typography variant="body2" color="textSecondary" sx={{ p: 1.5, pt: `${PANEL_HEADER_HEIGHT + 12}px` }}>
            Cleared - waiting for new logs…
          </Typography>
        )}
        {visibleCount > 0 && filteredEntries.length === 0 && (
          <Typography variant="body2" color="textSecondary" sx={{ p: 1.5, pt: `${PANEL_HEADER_HEIGHT + 12}px` }}>
            {hasActiveFilters ? "No logs match the current filters" : `No logs at "${minLevel}" level or above`}
          </Typography>
        )}
        {filteredEntries.length > 0 && (
          <List
            listRef={listRef}
            rowCount={filteredEntries.length}
            rowHeight={dynamicRowHeight}
            rowComponent={LogRow}
            rowProps={{ entries: filteredEntries, showTimestamp, showTag, setRowHeight: dynamicRowHeight.setRowHeight }}
            rowKey={(index, data) => data.entries[index]!.id}
            // Senza, i tasti di navigazione non raggiungono la lista.
            tabIndex={0}
            // Lo scroll anchoring del browser sposta scrollTop da solo quando il contenuto cresce.
            style={{ height: "100%", scrollbarGutter: "stable", overflowAnchor: "none" }}
          />
        )}
      </Box>
      {!stuckToBottom && filteredEntries.length > 0 && (
        <Fab
          size="small"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          sx={{ position: "absolute", bottom: 24, right: 24, boxShadow: 3 }}
        >
          <KeyboardArrowDown />
        </Fab>
      )}
    </Box>
  );
}
