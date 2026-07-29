import { Delete, Edit } from "@mui/icons-material";
import { Box, Checkbox, Divider, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Generic list-entry row, laid out as a CSS grid so sibling rows (CU/TV/camera/...) line
// up on the same columns: leading (checkbox/icon/label) | indicators | context | actions
// | edit/delete - no matter how deep a row sits in the tree, and reflowing with the
// container's width instead of relying on hardcoded pixel totals. No knowledge of what a
// row represents - the caller decides icon, chips and semantics. Zones, always in this
// order so callers can't interleave them:
//  - `indicators`: read-only status (name/value pairs, not clickable) - right-aligned so
//    the same indicator always lands in the same spot regardless of how many others are
//    present, and visually distinct from `actions` which are clickable chips
//  - `context`: reserved column for info specific to the entry kind (e.g. live connection
//    progress for an ADB target, active workflow for a camera) - empty until a caller
//    fills it in
//  - `actions`: things the user can click to do something (chips, buttons)
//
// Callers nest rows visually by wrapping children in a padded/bordered Box (see
// ControlUnitCard/TvRow). Every such wrapper - and every EntryRow itself - subgrids from
// the nearest ancestor that established the grid (via `entryRowGridSx`, once per
// independent list). CSS subgrid guarantees each column aligns to the same X across all
// of them; the wrapper's `pl`/`borderLeft` only ever eats into the leading column, because
// that's the one the tree indentation lives in, so nesting depth needs no JS bookkeeping.
// -------------------------------------------------------------------------------------

// Leading is capped at a real length so long labels truncate (`noWrap`) instead of
// stretching the column. Indicators size to their own content (`auto`, never below its
// min-content since it can flex-wrap - a track can shrink and force a wrap, but never
// below what's needed to render without overlapping its neighbor). Context is the one
// flexible column (`1fr`, floored at its own min-content) so it soaks up whatever space
// is left on wide screens instead of leaving it stranded past the last column. Actions
// and edit/delete get a real fixed width so they never reflow with what a particular row
// happens to render (a longer button label, an extra chip, ...). If nothing fits even at
// minimum, the grid (not the row) overflows and the root's `overflowX: auto` turns it into
// a horizontal scroll instead of clipped/garbled content.
const ENTRY_ROW_GRID_TEMPLATE_COLUMNS = "minmax(160px, 300px) auto minmax(min-content, 1fr) 160px 76px";

// Establishes the shared column grid - use once per independent list (a CU card, the
// unassigned TVs/cameras list, ...).
export const entryRowGridSx = {
  display: "grid",
  gridTemplateColumns: ENTRY_ROW_GRID_TEMPLATE_COLUMNS,
  overflowX: "auto",
};

// Continues the grid through a nesting wrapper (or the row itself) so its columns stay
// pinned to the ancestor's.
export const entryRowSubgridSx = {
  display: "grid",
  gridTemplateColumns: "subgrid",
  gridColumn: "1 / -1",
};

export interface EntryRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly secondary?: string;
  readonly checked: boolean;
  readonly checkedTitle?: string;
  readonly indicators?: ReactNode[];
  readonly context?: ReactNode;
  readonly actions?: ReactNode[];
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function EntryRow({
  icon,
  label,
  secondary,
  checked,
  checkedTitle,
  indicators = [],
  context,
  actions = [],
  onToggle,
  onEdit,
  onDelete,
}: EntryRowProps) {
  return (
    <Box sx={{ ...entryRowSubgridSx, alignItems: "center", columnGap: 1.5, py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <Checkbox checked={checked} onChange={onToggle} size="small" title={checkedTitle} sx={{ flexShrink: 0 }} />
        <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
            {label}
          </Typography>
          {secondary && (
            <Typography variant="caption" color="textSecondary" noWrap sx={{ display: "block" }}>
              {secondary}
            </Typography>
          )}
        </Box>
      </Box>
      <Stack
        direction="row"
        spacing={1.5}
        divider={<Divider orientation="vertical" flexItem />}
        sx={{
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-start",
          "& > .MuiListItemText-root": { width: 110 },
        }}
      >
        {indicators}
      </Stack>
      <Box sx={{ display: "flex", alignItems: "center" }}>{context}</Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 1 }}
      >
        {actions}
      </Stack>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <IconButton size="small" onClick={onEdit} title="Edit label">
          <Edit fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onDelete} title="Remove">
          <Delete fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
