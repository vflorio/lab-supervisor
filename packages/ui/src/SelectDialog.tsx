import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Generic "pick one from a list" dialog: a title, a list of selectable option cards
// (primary/secondary/trailing), and a close action. No knowledge of what's being picked.
// -------------------------------------------------------------------------------------

export interface SelectOption {
  readonly id: string;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly trailing?: ReactNode;
}

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
          <Typography variant="body2" color="text.secondary">
            {emptyMessage ?? "No options available."}
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {options.map((option) => (
              <Paper
                key={option.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  bgcolor: option.id === selectedId ? "action.selected" : undefined,
                }}
                onClick={() => onSelect(option.id)}
              >
                <Box>
                  <Typography variant="body2">{option.primary}</Typography>
                  {option.secondary && (
                    <Typography variant="caption" color="text.secondary">
                      {option.secondary}
                    </Typography>
                  )}
                </Box>
                {option.trailing}
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
