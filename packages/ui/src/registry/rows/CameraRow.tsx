import { Edit, Link as LinkIcon, Usb, Videocam } from "@mui/icons-material";
import { Button, IconButton, Stack } from "@mui/material";
import type { CameraEntry } from "../../domain/types";
import { EntryRow } from "../../misc/EntryRow";
import { AdbBridgeActivityView } from "../activity/AdbBridgeActivityView";
import { RearmRecoveryButton, RecoveryActivityView } from "../activity/RecoveryActivityView";
import { AdbDeviceReachableView } from "../indicators/AdbDeviceReachableView";
import { AgentProvisionedView } from "../indicators/AgentProvisionedView";
import { SuitestCameraConnectedView } from "../indicators/SuitestCameraConnectedView";
import { SuitestCameraRecordingView } from "../indicators/SuitestCameraRecordingView";
import { SuitestCameraStreamingView } from "../indicators/SuitestCameraStreamingView";
import { ProvisionAgentButton } from "../ProvisionAgentButton";
import { WorkflowLauncher } from "../WorkflowLauncher";

export interface CameraRowProps {
  readonly camera: CameraEntry;
  readonly connected?: boolean;
  readonly recording?: boolean;
  readonly streaming?: boolean;
  readonly adbReachable?: boolean;
  readonly agentProvisioned?: boolean;
  readonly agentInstalled?: boolean;
  readonly agentMissing?: readonly string[];
  readonly provisioningConfigured?: boolean;
  readonly provisioningBusy?: boolean;
  readonly recoveryStatus?: string;
  readonly adbActivityStatus?: string;
  readonly workflows?: readonly string[];
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onCreateAdb?: () => void;
  readonly onEditAdbIp?: () => void;
  readonly onLinkSuitest?: () => void;
  readonly onRunWorkflow?: (workflowName: string) => void;
  readonly onRearmRecovery?: () => void;
  readonly onProvisionAgent?: () => void;
}

// Riga camera: foglia della gerarchia, nessun figlio. "Link Suitest" compare solo finché la
// camera non è collegata a un video-capture-device. Sull'ADB un solo bottone alla volta: senza
// `adbId` si crea+assegna un host in un colpo solo, una volta assegnato resta solo l'edit IP -
// non esiste un flusso per "cambiare" l'host assegnato con uno diverso.
export function CameraRow({
  camera,
  connected,
  recording,
  streaming,
  adbReachable,
  agentProvisioned,
  agentInstalled,
  agentMissing,
  provisioningConfigured = false,
  provisioningBusy,
  recoveryStatus,
  adbActivityStatus,
  workflows = [],
  onToggle,
  onEdit,
  onDelete,
  onCreateAdb,
  onEditAdbIp,
  onLinkSuitest,
  onRunWorkflow,
  onRearmRecovery,
  onProvisionAgent,
}: CameraRowProps) {
  return (
    <EntryRow
      icon={<Videocam fontSize="small" />}
      label={camera.label}
      secondary={camera.adbId}
      checked={camera.controlled}
      checkedTitle="Controlled by supervisor"
      indicators={[
        <SuitestCameraConnectedView key={`${camera.id}-conn`} value={connected} />,
        <SuitestCameraRecordingView key={`${camera.id}-rec`} value={recording} />,
        <SuitestCameraStreamingView key={`${camera.id}-stream`} value={streaming} />,
        <AdbDeviceReachableView key={`${camera.id}-adb`} value={adbReachable} />,
        <AgentProvisionedView key={`${camera.id}-agent`} value={agentProvisioned} missing={agentMissing} />,
      ]}
      context={
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          {camera.videoCaptureDeviceId && <RecoveryActivityView status={recoveryStatus} />}
          <AdbBridgeActivityView status={adbActivityStatus} />
        </Stack>
      }
      actions={[
        !camera.videoCaptureDeviceId && onLinkSuitest && (
          <Button
            key={`${camera.id}-link`}
            size="small"
            variant="outlined"
            startIcon={<LinkIcon fontSize="small" />}
            onClick={onLinkSuitest}
          >
            Link Suitest
          </Button>
        ),
        !camera.adbId && onCreateAdb && (
          <Button
            key={`${camera.id}-adb`}
            size="small"
            variant="outlined"
            startIcon={<Usb fontSize="small" />}
            onClick={onCreateAdb}
          >
            Add ADB
          </Button>
        ),
        camera.adbId && onEditAdbIp && (
          <Button
            key={`${camera.id}-adb`}
            size="small"
            variant="outlined"
            startIcon={<Usb fontSize="small" />}
            onClick={onEditAdbIp}
          >
            ADB
          </Button>
        ),
        onProvisionAgent && (
          <ProvisionAgentButton
            key={`${camera.id}-provision`}
            provisioned={agentProvisioned}
            installed={agentInstalled}
            configured={provisioningConfigured}
            busy={provisioningBusy}
            onProvision={onProvisionAgent}
          />
        ),
        onRunWorkflow && <WorkflowLauncher key={`${camera.id}-wf`} workflows={workflows} onLaunch={onRunWorkflow} />,
        <RearmRecoveryButton
          key={`${camera.id}-reset`}
          recoveryStatus={recoveryStatus}
          onRearmRecovery={onRearmRecovery}
        />,
      ]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
