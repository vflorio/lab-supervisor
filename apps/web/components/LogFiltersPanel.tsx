import { DoneAll, RemoveDone, Search } from "@mui/icons-material";
import {
  alpha,
  Chip,
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
import type { LogLevel } from "@supervisor/core/logger/logger";

const FILTERABLE_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export interface LogFiltersPanelProps {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly availableTags: ReadonlyMap<string, string | undefined>;
  readonly disabledTags: ReadonlySet<string>;
  readonly onToggleTag: (tag: string) => void;
  readonly anyTagDisabled: boolean;
  readonly onToggleAllTags: () => void;
  readonly minLevel: LogLevel;
  readonly onMinLevelChange: (level: LogLevel) => void;
  readonly showTimestamp: boolean;
  readonly onShowTimestampChange: (value: boolean) => void;
  readonly showTag: boolean;
  readonly onShowTagChange: (value: boolean) => void;
}

export function LogFiltersPanel({
  search,
  onSearchChange,
  availableTags,
  disabledTags,
  onToggleTag,
  anyTagDisabled,
  onToggleAllTags,
  minLevel,
  onMinLevelChange,
  showTimestamp,
  onShowTimestampChange,
  showTag,
  onShowTagChange,
}: LogFiltersPanelProps) {
  return (
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
        onChange={(event) => onSearchChange(event.target.value)}
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
              <IconButton size="small" onClick={onToggleAllTags} sx={{ p: 0.25 }}>
                {anyTagDisabled ? <DoneAll sx={{ fontSize: 14 }} /> : <RemoveDone sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>
          </Stack>
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
            {[...availableTags]
              .toSorted(([a], [b]) => a.localeCompare(b))
              .map(([tag, color]) => [tag, color, !disabledTags.has(tag)] as const)
              .map(([tag, color, active]) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  onClick={() => onToggleTag(tag)}
                  sx={{
                    color: active ? (color ?? "text.primary") : "text.secondary",
                    bgcolor: active && color ? alpha(color, 0.15) : "transparent",
                    borderColor: color ?? "divider",
                    opacity: active ? 1 : 0.6,
                  }}
                />
              ))}
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
            onChange={(event: SelectChangeEvent) => onMinLevelChange(event.target.value as LogLevel)}
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
              onChange={(event) => onShowTimestampChange(event.target.checked)}
            />
          }
          label={<Typography sx={{ fontSize: 11 }}>Date/time</Typography>}
        />
        <FormControlLabel
          sx={{ ml: 0, gap: 0.5 }}
          control={
            <Switch size="small" checked={showTag} onChange={(event) => onShowTagChange(event.target.checked)} />
          }
          label={<Typography sx={{ fontSize: 11 }}>Tags</Typography>}
        />
      </Stack>
    </Stack>
  );
}
