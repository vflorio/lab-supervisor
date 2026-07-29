import { Chip } from "@mui/material";
import * as Network from "@supervisor/core/network";
import { SelectDialog } from "@supervisor/ui/SelectDialog";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import type { CameraView } from "./types";

export function AssignCameraDialog({
  camera,
  adbDevices,
  usedTargets,
  onAssign,
  onClose,
}: {
  camera: CameraView | null;
  adbDevices: readonly AdbDevice[];
  usedTargets: ReadonlySet<string>;
  onAssign: (target: string) => void;
  onClose: () => void;
}) {
  const selectedTarget = camera?.adb ? Network.format(camera.adb.target) : undefined;
  const candidates = adbDevices.filter((d) => d.target === selectedTarget || !usedTargets.has(d.target));

  return (
    <SelectDialog
      open={camera !== null}
      title={`Assegna host ADB${camera ? ` - ${camera.label}` : ""}`}
      selectedId={selectedTarget}
      options={candidates.map((d) => ({
        id: d.target,
        primary: d.target,
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
