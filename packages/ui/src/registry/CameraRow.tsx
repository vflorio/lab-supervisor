import { Link as LinkIcon, Usb, Videocam } from "@mui/icons-material";
import { Button, Stack } from "@mui/material";
import type { CameraEntry } from "../domain/types";
import { EntryRow } from "../misc/EntryRow";
import { AdbBridgeActivityView } from "./AdbBridgeActivityView";
import { AdbDeviceReachableView } from "./AdbDeviceReachableView";
import { isRecoveryStuck, RecoveryActivityView } from "./RecoveryActivityView";
import { SuitestCameraConnectedView } from "./SuitestCameraConnectedView";
import { SuitestCameraRecordingView } from "./SuitestCameraRecordingView";
import { SuitestCameraStreamingView } from "./SuitestCameraStreamingView";
import { WorkflowLauncher } from "./WorkflowLauncher";

export interface CameraRowProps {
  readonly camera: CameraEntry;
  readonly connected?: boolean;
  readonly recording?: boolean;
  readonly streaming?: boolean;
  readonly adbReachable?: boolean;
  readonly recoveryStatus?: string;
  readonly adbActivityStatus?: string;
  readonly workflows?: readonly string[];
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onAssignAdb: () => void;
  readonly onLinkSuitest?: () => void;
  readonly onRunWorkflow?: (workflowName: string) => void;
  readonly onResetRecovery?: () => void;
}

// Riga camera: foglia della gerarchia, nessun figlio. "Link Suitest" compare solo finché la
// camera non è collegata a un video-capture-device; l'azione ADB cambia label in base a
// `camera.adbId` invece di offrire due bottoni distinti (§6.3).
export function CameraRow({
  camera,
  connected,
  recording,
  streaming,
  adbReachable,
  recoveryStatus,
  adbActivityStatus,
  workflows = [],
  onToggle,
  onEdit,
  onDelete,
  onAssignAdb,
  onLinkSuitest,
  onRunWorkflow,
  onResetRecovery,
}: CameraRowProps) {
  return (
    <EntryRow
      icon={<Videocam fontSize="small" />}
      label={camera.label}
      secondary={camera.adbId}
      checked={camera.controlled}
      checkedTitle="Controlled by supervisor"
      indicators={[
        <SuitestCameraConnectedView key="conn" value={connected} />,
        <SuitestCameraRecordingView key="rec" value={recording} />,
        <SuitestCameraStreamingView key="stream" value={streaming} />,
        <AdbDeviceReachableView key="adb" value={adbReachable} />,
      ]}
      context={
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <RecoveryActivityView status={recoveryStatus} />
          <AdbBridgeActivityView status={adbActivityStatus} />
        </Stack>
      }
      actions={[
        !camera.videoCaptureDeviceId && onLinkSuitest && (
          <Button
            key="link"
            size="small"
            variant="outlined"
            startIcon={<LinkIcon fontSize="small" />}
            onClick={onLinkSuitest}
          >
            Link Suitest
          </Button>
        ),
        <Button key="adb" size="small" variant="outlined" startIcon={<Usb fontSize="small" />} onClick={onAssignAdb}>
          {camera.adbId ? "Change ADB" : "Assign ADB"}
        </Button>,
        onRunWorkflow && <WorkflowLauncher key="wf" workflows={workflows} onLaunch={onRunWorkflow} />,
        isRecoveryStuck(recoveryStatus) && onResetRecovery && (
          <Button key="reset" size="small" variant="outlined" color="error" onClick={onResetRecovery}>
            Reset recovery
          </Button>
        ),
      ]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
