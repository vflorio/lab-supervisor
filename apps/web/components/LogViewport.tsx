import { KeyboardArrowDown } from "@mui/icons-material";
import { Box, Fab, Typography } from "@mui/material";
import type { LogEntry } from "@supervisor/core/logger/log-stream";
import type { LogLevel } from "@supervisor/core/logger/logger";
import { List, useDynamicRowHeight } from "react-window";
import type { ServiceStatus } from "../hooks/useLogFeed";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { PANEL_HEADER_HEIGHT } from "../layout/PanelHeader";
import { LogRow } from "./LogRow";

const VIEWPORT_BG = "#0a0c0e";
const DEFAULT_ROW_HEIGHT = 20;
const SHOULD_STICK_TO_BOTTOM = true;

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
  // useDynamicRowHeight tiene una cache altezza-per-indice, non per entry: quando i filtri
  // cambiano, l'insieme visibile viene ricomposto e gli stessi indici puntano a entry diverse
  // (spesso di lunghezza diversa) rispetto a quando sono state misurate, con conseguenti righe
  // troncate/sovrapposte. `rowHeightKey` forza l'hook a scartare la cache stale ogni volta che
  // cambia il criterio di filtro (non ad ogni nuovo log, che si limita ad accodare in fondo).
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: DEFAULT_ROW_HEIGHT, key: rowHeightKey });
  const { listRef, stuckToBottom, handleRowsRendered, scrollToBottom } = useStickToBottom(
    filteredEntries,
    dynamicRowHeight,
    SHOULD_STICK_TO_BOTTOM,
  );

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
            rowProps={{ entries: filteredEntries, showTimestamp, showTag }}
            rowKey={(index, data) => data.entries[index]!.id}
            onRowsRendered={handleRowsRendered}
            style={{ height: "100%", scrollbarGutter: "stable" }}
          />
        )}
      </Box>
      {SHOULD_STICK_TO_BOTTOM && !stuckToBottom && filteredEntries.length > 0 && (
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
