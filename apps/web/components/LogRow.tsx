import { Box } from "@mui/material";
import { LEVEL_PALETTE, TAG_PALETTE } from "@supervisor/core/logger/log-palette";
import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { padContinuationLines } from "@supervisor/core/logger/logger";
import type { RowComponentProps } from "react-window";

const TIMESTAMP_COLOR = "#6e7681";
const INDENT_SIZE = 2;

export interface LogRowProps {
  readonly entries: readonly LogEntry[];
  readonly showTimestamp: boolean;
  readonly showTag: boolean;
}

export function LogRow({
  index,
  style,
  ariaAttributes,
  entries,
  showTimestamp,
  showTag,
}: RowComponentProps<LogRowProps>) {
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
