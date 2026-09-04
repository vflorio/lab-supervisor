import { ClearAll, FilterAlt } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";

export interface LogViewActionsProps {
  readonly filtersOpen: boolean;
  readonly onToggleFilters: () => void;
  readonly hasActiveFilters: boolean;
  readonly onClear: () => void;
  readonly canClear: boolean;
}

// Toolbar di una log view (Filters toggle + Clear), guidata da useLogView - stessa coppia di
// bottoni per ogni stream instanziato, non solo per i log del servizio.
export function LogViewActions({ filtersOpen, onToggleFilters, hasActiveFilters, onClear, canClear }: LogViewActionsProps) {
  return (
    <>
      <Tooltip title="Filters">
        <IconButton size="small" onClick={onToggleFilters} color={filtersOpen || hasActiveFilters ? "primary" : "default"}>
          <FilterAlt fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Clear logs">
        <IconButton size="small" onClick={onClear} disabled={!canClear}>
          <ClearAll fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}
