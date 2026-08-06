import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Picker, type PickerOption } from "../picker/Picker";

// -------------------------------------------------------------------------------------
// Generic "pick one from a list" dialog: a title, a searchable Picker, and a close
// action. No knowledge of what's being picked.
// -------------------------------------------------------------------------------------

export type SelectOption = PickerOption;

export interface SelectDialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly options: readonly SelectOption[];
  readonly selectedId?: string;
  readonly emptyMessage?: ReactNode;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
}

export function SelectDialog({ open, title, options, selectedId, emptyMessage, onSelect, onClose }: SelectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {options.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            {emptyMessage ?? "No options available."}
          </Typography>
        ) : (
          <Picker
            options={options}
            value={selectedId ?? null}
            onChange={(id) => id && onSelect(id)}
            placeholder="Cerca..."
            autoFocus
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
