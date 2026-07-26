import { ClearAll, KeyboardArrowDown } from "@mui/icons-material";
import { Box, Fab, IconButton, MenuItem, Select, type SelectChangeEvent, Tooltip, Typography } from "@mui/material";
import { LEVEL_PALETTE, TAG_PALETTE } from "@supervisor/core/log-palette";
import { isLevelEnabled, type LogLevel, padContinuationLines } from "@supervisor/core/logger";
import { ResizablePanel } from "@supervisor/ui/ResizablePanel";
import { useEffect, useRef, useState } from "react";
import { useLogFeed } from "../hooks/useLogFeed";

const TIMESTAMP_COLOR = "#6e7681";
const INDENT_SIZE = 2;

// Livelli effettivamente emessi da Logger (fatal/trace/silent non sono mai loggati via Tagged)
const FILTERABLE_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

// Quanto vicino al fondo bisogna essere (in px) per considerare l'utente "agganciato" all'ultima riga
const STICK_TO_BOTTOM_THRESHOLD = 48;

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const WIDTH_STORAGE_KEY = "log-panel:width";

// Pannello log globale (in +Layout.tsx, visibile su ogni pagina), ridimensionabile
// trascinando il bordo sinistro - la dimensione scelta dall'utente persiste tra le sessioni
// (ResizablePanel), quindi nessun limite massimo: il controllo è delegato all'utente.
export function LogPanel() {
  const [minLevel, setMinLevel] = useState<LogLevel>("debug");
  const { entries, status } = useLogFeed();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  // Clear "solo DOM": nasconde le righe già viste senza toccare il LogFeed condiviso (altre
  // tab/consumer, o una successiva riapertura del pannello, continuano a vederle tutte)
  const [clearedBeforeId, setClearedBeforeId] = useState(-1);

  const visibleEntries = entries.filter((entry) => entry.id > clearedBeforeId);
  const filteredEntries = visibleEntries.filter((entry) => isLevelEnabled(minLevel, entry.level));

  const clearLogs = () => {
    setClearedBeforeId(entries.at(-1)?.id ?? clearedBeforeId);
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredEntries]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD;
    stickToBottomRef.current = atBottom;
    setStuckToBottom(atBottom);
  };

  const scrollToBottom = () => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
    setStuckToBottom(true);
  };

  return (
    <ResizablePanel
      component="aside"
      handleSide="left"
      storageKey={WIDTH_STORAGE_KEY}
      defaultSize={DEFAULT_WIDTH}
      minSize={MIN_WIDTH}
      sx={{
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, pb: 1, gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Service Logs
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Select
            size="small"
            variant="standard"
            value={minLevel}
            onChange={(event: SelectChangeEvent) => setMinLevel(event.target.value as LogLevel)}
            sx={{ fontSize: 12, width: 60 }}
          >
            {FILTERABLE_LEVELS.map((level) => (
              <MenuItem key={level} value={level} sx={{ fontSize: 12 }}>
                {level}
              </MenuItem>
            ))}
          </Select>
          <Tooltip title="Clear logs">
            <span>
              <IconButton size="small" onClick={clearLogs} disabled={visibleEntries.length === 0}>
                <ClearAll fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ position: "relative", flexGrow: 1, minHeight: 0 }}>
        <Box
          ref={viewportRef}
          onScroll={handleScroll}
          sx={{
            height: "100%",
            overflow: "auto",
            scrollbarGutter: "stable",
            bgcolor: "#0a0c10",
            p: 1.5,
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {entries.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {status === "online" ? "Waiting for logs…" : "Connecting to service…"}
            </Typography>
          )}
          {entries.length > 0 && visibleEntries.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Cleared - waiting for new logs…
            </Typography>
          )}
          {visibleEntries.length > 0 && filteredEntries.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No logs at "{minLevel}" level or above
            </Typography>
          )}
          {filteredEntries.map((entry) => {
            const time = new Date(entry.timestamp).toLocaleTimeString("it-IT");
            const indent = " ".repeat(entry.depth * INDENT_SIZE);
            const tagColor = entry.color !== undefined ? TAG_PALETTE[entry.color % TAG_PALETTE.length]?.hex : undefined;
            const tagText = entry.tag ? `[${entry.tag}] ` : "";
            const prefixWidth = `${time} | `.length + indent.length + tagText.length;
            const message = padContinuationLines(entry.message, prefixWidth);

            return (
              <Box
                key={entry.id}
                component="pre"
                sx={{
                  m: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: LEVEL_PALETTE[entry.level]?.hex ?? "text.primary",
                }}
              >
                <Box component="span" sx={{ color: TIMESTAMP_COLOR }}>
                  {time} |{" "}
                </Box>
                {indent}
                {entry.tag && (
                  <Box component="span" sx={{ color: tagColor, fontWeight: 600 }}>
                    [{entry.tag}]{" "}
                  </Box>
                )}
                {message}
              </Box>
            );
          })}
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
    </ResizablePanel>
  );
}
