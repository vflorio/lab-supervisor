import { Chip } from "@mui/material";
import { SelectDialog } from "../../misc/SelectDialog";

export interface AssignCameraCandidate {
  readonly id: string;
  readonly label: string;
  readonly status: string;
}

export interface AssignCameraDialogProps {
  readonly open: boolean;
  readonly cameraLabel?: string;
  readonly selectedAdbId?: string;
  readonly candidates: readonly AssignCameraCandidate[];
  readonly onAssign: (adbId: string) => void;
  readonly onClose: () => void;
}

export function AssignCameraDialog({
  open,
  cameraLabel,
  selectedAdbId,
  candidates,
  onAssign,
  onClose,
}: AssignCameraDialogProps) {
  return (
    <SelectDialog
      open={open}
      title={`Assegna host ADB${cameraLabel ? ` - ${cameraLabel}` : ""}`}
      selectedId={selectedAdbId}
      options={candidates.map((d) => ({
        id: d.id,
        primary: d.label,
        trailing: <Chip size="small" label={d.status} color={d.status === "device" ? "success" : "default"} />,
      }))}
      emptyMessage={
        <>
          Nessun device ADB disponibile al momento.
          <br />
          Verifica che il device sia connesso in rete e rilevato dal servizio.
        </>
      }
      onSelect={onAssign}
      onClose={onClose}
    />
  );
}
