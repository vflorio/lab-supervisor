import { Box } from "@mui/material";
import { LEVEL_PALETTE, TAG_PALETTE } from "@supervisor/core/logger/log-palette";
import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { padContinuationLines } from "@supervisor/core/logger/logger";
import { useLayoutEffect, useRef } from "react";
import type { DynamicRowHeight, RowComponentProps } from "react-window";

const TIMESTAMP_COLOR = "#6e7681";
const INDENT_SIZE = 2;

export interface LogRowProps {
  readonly entries: readonly LogEntry[];
  readonly showTimestamp: boolean;
  readonly showTag: boolean;
  readonly setRowHeight: DynamicRowHeight["setRowHeight"];
}

export function LogRow({
  index,
  style,
  ariaAttributes,
  entries,
  showTimestamp,
  showTag,
  setRowHeight,
}: RowComponentProps<LogRowProps>) {
  const entry = entries[index]!;
  const rowRef = useRef<HTMLPreElement>(null);

  // Il ResizeObserver di react-window notifica in modo asincrono, e fino ad allora la riga resta
  // posizionata sull'altezza di default sovrapponendosi alla successiva. Misurare qui la porta in
  // cache prima del paint. Nessun dep array perché l'a-capo dipende dalla larghezza del pannello;
  // `setRowHeight` ignora i valori invariati, quindi non innesca un loop.
  useLayoutEffect(() => {
    const element = rowRef.current;
    if (element) setRowHeight(index, element.getBoundingClientRect().height);
  });

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
      ref={rowRef}
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
