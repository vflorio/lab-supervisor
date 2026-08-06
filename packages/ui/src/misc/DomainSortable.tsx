import { Delete, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { IconButton } from "@mui/material";

export interface DomainSortableProps {
  readonly index: number;
  readonly length: number;
  readonly onMove: (delta: 1 | -1) => void;
  readonly onRemove: () => void;
  readonly removeDisabled?: boolean;
}

export function DomainSortable({ index, length, onMove, onRemove, removeDisabled }: DomainSortableProps) {
  return (
    <>
      <div style={{ flexGrow: 1 }} />
      <IconButton size="small" onClick={() => onMove(-1)} disabled={index === 0}>
        <KeyboardArrowUp fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={() => onMove(1)} disabled={index === length - 1}>
        <KeyboardArrowDown fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={onRemove} disabled={removeDisabled}>
        <Delete fontSize="small" />
      </IconButton>
    </>
  );
}
