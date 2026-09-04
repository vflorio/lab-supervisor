import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";

export interface AssignAdbForm {
  readonly ip: string;
}

export interface AssignAdbDialogProps {
  readonly open: boolean;
  readonly cameraLabel?: string;
  readonly device: AssignAdbForm;
  readonly status?: string | null;
  readonly onChange: (device: AssignAdbForm) => void;
  readonly onAssign: () => void;
  readonly onClose: () => void;
}

// Crea l'host ADB e lo assegna alla camera in un unico step: non esiste un pool di host
// standalone da gestire a parte, ogni host nasce già legato alla camera per cui è stato
// registrato (§6.3).
export function AssignAdbDialog({ open, cameraLabel, device, status, onChange, onAssign, onClose }: AssignAdbDialogProps) {
  const canSubmit = !!device.ip;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add ADB Host{cameraLabel ? ` - ${cameraLabel}` : ""}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <TextField
            autoFocus
            label="IP"
            placeholder="192.168.1.100"
            value={device.ip}
            onChange={(e) => onChange({ ip: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && onAssign()}
            fullWidth
          />
          {status && <Chip size="small" label={status} color={status === "device" ? "success" : "default"} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAssign} variant="contained" disabled={!canSubmit}>
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
