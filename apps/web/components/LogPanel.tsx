import { ClearAll, DoneAll, FilterAlt, KeyboardArrowDown, RemoveDone, Search, Terminal } from "@mui/icons-material";
import {
  alpha,
  Box,
  Chip,
  Fab,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { LEVEL_PALETTE, TAG_PALETTE } from "@supervisor/core/logger/log-palette";
import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { isLevelEnabled, type LogLevel, padContinuationLines } from "@supervisor/core/logger/logger";
import { ResizablePanel } from "@supervisor/ui/ResizablePanel";
import { useEffect, useRef, useState } from "react";
import { List, type RowComponentProps, useDynamicRowHeight, useListRef } from "react-window";
import { useLogFeed } from "../hooks/useLogFeed";
import { PANEL_HEADER_HEIGHT, PanelHeader } from "../layout/PanelHeader";

const TIMESTAMP_COLOR = "#6e7681";
const INDENT_SIZE = 2;
const VIEWPORT_BG = "#0a0c0e";

const FILTERABLE_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const DEFAULT_ROW_HEIGHT = 20;

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const WIDTH_STORAGE_KEY = "log-panel:width";

interface LogRowProps {
  readonly entries: readonly LogEntry[];
  readonly showTimestamp: boolean;
  readonly showTag: boolean;
}

function LogRow({ index, style, ariaAttributes, entries, showTimestamp, showTag }: RowComponentProps<LogRowProps>) {
  const entry = entries[index]!;
  const time = new Date(entry.timestamp).toLocaleTimeString("it-IT");
  const indent = " ".repeat(entry.depth * INDENT_SIZE);
  const tagColor = entry.color !== undefined ? TAG_PALETTE[entry.color % TAG_PALETTE.length]?.hex : undefined;
  const timePrefix = showTimestamp ? `${time} | ` : "";
  const tagPrefix = showTag && entry.tag ? `[${entry.tag}] ` : "";
  const prefixWidth = timePrefix.length + indent.length + tagPrefix.length;
  const message = padContinuationLines(entry.message, prefixWidth);

  return (
    <Box
      component="pre"
      style={style}
      {...ariaAttributes}
      sx={{
        m: 0,
        px: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: LEVEL_PALETTE[entry.level]?.hex ?? "text.primary",
      }}
    >
      {showTimestamp && (
        <Box component="span" sx={{ color: TIMESTAMP_COLOR }}>
          {timePrefix}
        </Box>
      )}
      {indent}
      {showTag && entry.tag && (
        <Box component="span" sx={{ color: tagColor, fontWeight: 600 }}>
          {tagPrefix}
        </Box>
      )}
      {message}
    </Box>
  );
}

const shouldStickToBottom = false;

// Pannello log globale (in +Layout.tsx, visibile su ogni pagina), ridimensionabile
// trascinando il bordo sinistro - la dimensione scelta dall'utente persiste tra le sessioni
// (ResizablePanel), quindi nessun limite massimo: il controllo è delegato all'utente.
export function LogPanel() {
  const [minLevel, setMinLevel] = useState<LogLevel>("debug");
  const { entries, status } = useLogFeed();
  const listRef = useListRef(null);
  const stickToBottomRef = useRef(true);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  // Clear "solo DOM": nasconde le righe già viste senza toccare il LogFeed condiviso (altre
  // tab/consumer, o una successiva riapertura del pannello, continuano a vederle tutte)
  const [clearedBeforeId, setClearedBeforeId] = useState(-1);

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [disabledTags, setDisabledTags] = useState<ReadonlySet<string>>(new Set());
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [showTag, setShowTag] = useState(true);

  // useDynamicRowHeight tiene una cache altezza-per-indice, non per entry: quando i filtri
  // cambiano, l'insieme visibile viene ricomposto e gli stessi indici puntano a entry diverse
  // (spesso di lunghezza diversa) rispetto a quando sono state misurate, con conseguenti righe
  // troncate/sovrapposte. Passare `key` forza l'hook a scartare la cache stale ogni volta che
  // cambia il criterio di filtro (non ad ogni nuovo log, che si limita ad accodare in fondo).
  const rowHeightKey = `${minLevel}|${search}|${[...disabledTags].sort().join(",")}|${clearedBeforeId}`;
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: DEFAULT_ROW_HEIGHT, key: rowHeightKey });

  // Elenco tag stabile: a differenza di derivarlo dagli entry correnti (che scorrono/scadono
  // di continuo), qui si accumula man mano che nuovi tag vengono visti e non si rimuove mai -
  // altrimenti con i log che scorrono veloci le chip del filtro appaiono/scompaiono/si
  // riordinano di continuo, rendendo impossibile selezionarle.
  const knownTagsRef = useRef<Map<string, string | undefined>>(new Map());
  const lastScannedIdRef = useRef(-1);
  const [, bumpTagsVersion] = useState(0);

  useEffect(() => {
    const lastEntry = entries.at(-1);
    if (!lastEntry || lastEntry.id <= lastScannedIdRef.current) return;

    let changed = false;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      if (entry.id <= lastScannedIdRef.current) break;
      if (entry.tag && !knownTagsRef.current.has(entry.tag)) {
        knownTagsRef.current.set(
          entry.tag,
          entry.color !== undefined ? TAG_PALETTE[entry.color % TAG_PALETTE.length]?.hex : undefined,
        );
        changed = true;
      }
    }
    lastScannedIdRef.current = lastEntry.id;
    if (changed) bumpTagsVersion((v) => v + 1);
  }, [entries]);

  const availableTags = knownTagsRef.current;

  const visibleEntries = entries.filter((entry) => entry.id > clearedBeforeId);
  const levelEntries = visibleEntries.filter((entry) => isLevelEnabled(minLevel, entry.level));

  const searchQuery = search.trim().toLowerCase();
  const hasActiveFilters = searchQuery !== "" || disabledTags.size > 0 || minLevel !== "debug";
  const filteredEntries = levelEntries.filter((entry) => {
    if (entry.tag && disabledTags.has(entry.tag)) return false;
    if (
      searchQuery &&
      !entry.message.toLowerCase().includes(searchQuery) &&
      !entry.tag?.toLowerCase().includes(searchQuery)
    ) {
      return false;
    }
    return true;
  });

  const toggleTag = (tag: string) => {
    setDisabledTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // Se almeno un tag è disabilitato, il tasto li riabilita tutti; altrimenti li disabilita
  // tutti (comportamento a due stati, non un tri-state "parzialmente selezionato").
  const anyTagDisabled = disabledTags.size > 0;
  const toggleAllTags = () => {
    setDisabledTags(anyTagDisabled ? new Set() : new Set(availableTags.keys()));
  };

  const clearLogs = () => {
    setClearedBeforeId(entries.at(-1)?.id ?? clearedBeforeId);
  };

  useEffect(() => {
    if (!shouldStickToBottom) return;
    if (!stickToBottomRef.current || filteredEntries.length === 0) return;

    const scrollToLastRow = () => listRef.current?.scrollToRow({ index: filteredEntries.length - 1, align: "end" });
    scrollToLastRow();
    // Le righe multi-linea (messaggi con \n) misurano la propria altezza reale in modo
    // asincrono via ResizeObserver: il primo scroll usa ancora l'altezza stimata di default,
    // tagliando il contenuto appena arrivato finché non arriva questa seconda passata a frame
    // successivo, che corregge la posizione una volta nota l'altezza vera della riga.
    const raf = requestAnimationFrame(scrollToLastRow);
    return () => cancelAnimationFrame(raf);
  }, [filteredEntries, listRef]);

  const handleRowsRendered = (visible: { startIndex: number; stopIndex: number }) => {
    const atBottom = filteredEntries.length === 0 || visible.stopIndex >= filteredEntries.length - 1;
    stickToBottomRef.current = atBottom;
    setStuckToBottom(atBottom);
  };

  const scrollToBottom = () => {
    if (filteredEntries.length === 0) return;
    listRef.current?.scrollToRow({ index: filteredEntries.length - 1, align: "end", behavior: "smooth" });
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
      }}
    >
      {/* Viewport log a tutta altezza: header e filtri sono sovraimpressi (vedi overlay sotto),
          semitrasparenti e sfocati, così i log continuano a scorrere sotto di loro invece di
          essere spinti in basso quando i filtri si aprono. */}
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
          {entries.length === 0 && (
            <Typography variant="body2" color="textSecondary" sx={{ p: 1.5, pt: `${PANEL_HEADER_HEIGHT + 12}px` }}>
              {status === "online" ? "Waiting for logs…" : "Connecting to service…"}
            </Typography>
          )}
          {entries.length > 0 && visibleEntries.length === 0 && (
            <Typography variant="body2" color="textSecondary" sx={{ p: 1.5, pt: `${PANEL_HEADER_HEIGHT + 12}px` }}>
              Cleared - waiting for new logs…
            </Typography>
          )}
          {visibleEntries.length > 0 && filteredEntries.length === 0 && (
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
        {shouldStickToBottom && !stuckToBottom && filteredEntries.length > 0 && (
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
      {/* Overlay: header + filtri, in flow normale (non absolute) sopra il Box dei log - lo
          zIndex li mantiene sovraimpressi mentre lo sfondo semitrasparente/blur di
          PanelHeader e dello Stack filtri lascia intravedere i log che scorrono sotto. */}
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <PanelHeader
          icon={<Terminal sx={{ fontSize: 16 }} />}
          title="Service Logs"
          sticky={false}
          px={1.5}
          actions={
            <>
              <Tooltip title="Filters">
                <IconButton
                  size="small"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  color={filtersOpen || hasActiveFilters ? "primary" : "default"}
                >
                  <FilterAlt fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear logs">
                <span>
                  <IconButton size="small" onClick={clearLogs} disabled={visibleEntries.length === 0}>
                    <ClearAll fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          }
        />
        {filtersOpen && (
          <Stack
            sx={{
              gap: 1.25,
              px: 1.5,
              py: 1.25,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: (t) => alpha(t.palette.background.paper, 0.85),
              backdropFilter: "blur(10px)",
            }}
          >
            <TextField
              size="small"
              fullWidth
              placeholder="Search logs…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ fontSize: 14 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            {availableTags.size > 0 && (
              <Stack sx={{ gap: 0.5 }}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Typography sx={{ fontSize: 11 }} color="text.secondary">
                    Tags
                  </Typography>
                  <Tooltip title={anyTagDisabled ? "Enable all tags" : "Disable all tags"}>
                    <IconButton size="small" onClick={toggleAllTags} sx={{ p: 0.25 }}>
                      {anyTagDisabled ? <DoneAll sx={{ fontSize: 14 }} /> : <RemoveDone sx={{ fontSize: 14 }} />}
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
                  {[...availableTags].map(([tag, color]) => {
                    const active = !disabledTags.has(tag);
                    return (
                      <Chip
                        key={tag}
                        label={tag}
                        size="small"
                        variant="outlined"
                        onClick={() => toggleTag(tag)}
                        sx={{
                          color: active ? (color ?? "text.primary") : "text.secondary",
                          bgcolor: active && color ? alpha(color, 0.15) : "transparent",
                          borderColor: color ?? "divider",
                          opacity: active ? 1 : 0.6,
                        }}
                      />
                    );
                  })}
                </Stack>
              </Stack>
            )}
            <Stack direction="row" sx={{ gap: 2, alignItems: "center" }}>
              <Stack direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
                <Typography sx={{ fontSize: 11 }} color="text.secondary">
                  Level
                </Typography>
                <Select
                  size="small"
                  variant="standard"
                  value={minLevel}
                  onChange={(event: SelectChangeEvent) => setMinLevel(event.target.value as LogLevel)}
                  sx={{ fontSize: 12, width: 64 }}
                >
                  {FILTERABLE_LEVELS.map((level) => (
                    <MenuItem key={level} value={level} sx={{ fontSize: 12 }}>
                      {level}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <FormControlLabel
                sx={{ ml: 0, gap: 0.5 }}
                control={
                  <Switch
                    size="small"
                    checked={showTimestamp}
                    onChange={(event) => setShowTimestamp(event.target.checked)}
                  />
                }
                label={<Typography sx={{ fontSize: 11 }}>Date/time</Typography>}
              />
              <FormControlLabel
                sx={{ ml: 0, gap: 0.5 }}
                control={
                  <Switch size="small" checked={showTag} onChange={(event) => setShowTag(event.target.checked)} />
                }
                label={<Typography sx={{ fontSize: 11 }}>Tags</Typography>}
              />
            </Stack>
          </Stack>
        )}
      </Box>
    </ResizablePanel>
  );
}
