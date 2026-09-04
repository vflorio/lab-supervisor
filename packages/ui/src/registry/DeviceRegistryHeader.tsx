import { PageHeader } from "./PageHeader";
import { StatusPill } from "./StatusPill";

export interface DeviceRegistryHeaderProps {
  readonly controlUnitCount: number;
  readonly tvCount: number;
  readonly cameraCount: number;
  readonly controlledCount: number;
}

// Header di pagina del registro: eyebrow+title generici via PageHeader, conteggi e badge
// "controlled" come pillole nella zona azioni - stessa convenzione già in uso nelle pagine
// reali (RegistryTree/RegistryHeartbeat passano Chip nella `actions` slot di PageHeader).
// Nessuna azione di creazione qui: un host ADB si crea solo contestualmente a una camera,
// dal bottone "Add ADB" della sua row (§6.3).
export function DeviceRegistryHeader({ controlUnitCount, tvCount, cameraCount, controlledCount }: DeviceRegistryHeaderProps) {
  return (
    <PageHeader
      eyebrow="Registry"
      title="Devices"
      actions={
        <>
          <StatusPill
            label={`${controlUnitCount} control units - ${tvCount} TVs - ${cameraCount} cameras`}
            tone="disabled"
          />
          <StatusPill label={`${controlledCount} controlled`} tone="success" />
        </>
      }
    />
  );
}
