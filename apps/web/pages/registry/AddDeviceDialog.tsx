import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import type { NewAdbTargetForm } from "./types";

export function AddDeviceDialog({
  open,
  device,
  onChange,
  onAdd,
  onClose,
}: {
  open: boolean;
  device: NewAdbTargetForm;
  onChange: (d: NewAdbTargetForm) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const canSubmit = device.label && device.target;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add ADB Target</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <TextField
          label="Label"
          value={device.label}
          onChange={(e) => onChange({ ...device, label: e.target.value })}
          fullWidth
        />
        <TextField
          label="Target"
          placeholder="192.168.1.100:5555"
          value={device.target}
          onChange={(e) => onChange({ ...device, target: e.target.value })}
          fullWidth
        />
        <Typography variant="caption" color="text.secondary">
          Candybox, Camere e TV sono gestiti da config seed / sync Suitest: qui puoi registrare solo un host ADB (es. un
          tablet), assegnabile in seguito a una camera con "Assign ADB Host".
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} variant="contained" disabled={!canSubmit}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
