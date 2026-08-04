import { Add } from "@mui/icons-material";
import { Button } from "@mui/material";
import { PageHeader } from "./PageHeader";
import { StatusPill } from "./StatusPill";

export interface DeviceRegistryHeaderProps {
  readonly controlUnitCount: number;
  readonly tvCount: number;
  readonly cameraCount: number;
  readonly controlledCount: number;
  readonly onAddDevice: () => void;
}

// Header di pagina del registro: eyebrow+title generici via PageHeader, conteggi e badge
// "controlled" come pillole nella zona azioni - stessa convenzione già in uso nelle pagine
// reali (RegistryTree/RegistryHeartbeat passano Chip nella `actions` slot di PageHeader).
export function DeviceRegistryHeader({
  controlUnitCount,
  tvCount,
  cameraCount,
  controlledCount,
  onAddDevice,
}: DeviceRegistryHeaderProps) {
  return (
    <PageHeader
      eyebrow="Registry"
      title="Device Registry"
      actions={
        <>
          <StatusPill
            label={`${controlUnitCount} control units - ${tvCount} TVs - ${cameraCount} cameras`}
            tone="disabled"
          />
          <StatusPill label={`${controlledCount} controlled`} tone="success" />
          <Button size="small" variant="contained" startIcon={<Add fontSize="small" />} onClick={onAddDevice}>
            Add device
          </Button>
        </>
      }
    />
  );
}
