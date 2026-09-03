import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";

export interface AddDeviceForm {
  readonly ip: string;
}

export interface AddDeviceDialogProps {
  readonly open: boolean;
  readonly device: AddDeviceForm;
  readonly onChange: (device: AddDeviceForm) => void;
  readonly onAdd: () => void;
  readonly onClose: () => void;
}

export function AddDeviceDialog({ open, device, onChange, onAdd, onClose }: AddDeviceDialogProps) {
  const canSubmit = !!device.ip;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add ADB Target</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <TextField
          label="IP"
          placeholder="192.168.1.100"
          value={device.ip}
          onChange={(e) => onChange({ ip: e.target.value })}
          fullWidth
        />
        <Typography variant="caption" color="textSecondary">
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
