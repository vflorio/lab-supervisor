import { Link as LinkIcon, Usb, Videocam } from "@mui/icons-material";
import { Button } from "@mui/material";
import * as Network from "@supervisor/core/network";
import { ControlToggleButton, type DetailItem, EntryCard, StatusPill } from "@supervisor/ui/registry/index";
import * as O from "fp-ts/Option";
import { useActivityStat } from "../../components/ActivityStat";
import { usePredicateStat } from "../../components/PredicateStat";
import { RecoveryInterventionBadge, RecoveryResetButtons } from "../../components/RecoveryIntervention";
import { WorkflowLauncher } from "../../components/WorkflowLauncher";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import { adbBridgeColorFor, recoveryColorFor, workflowRunColorFor } from "./activityColors";
import type { CameraView, DeviceKind } from "./types";

const RECOVERY_DOMAIN = "suitest-camera";

export function CameraEntry({
  camera,
  adbStatus,
  onToggle,
  onEdit,
  onDelete,
  onAssign,
  onLink,
  onResetRecovery,
  workflows,
  onRunWorkflow,
}: {
  camera: CameraView;
  adbStatus: AdbDevice["status"] | null;
  onToggle: (kind: DeviceKind, id: string, controlled: boolean) => void;
  onEdit: (kind: DeviceKind, id: string, label: string) => void;
  onDelete: (kind: DeviceKind, id: string) => void;
  onAssign: () => void;
  onLink: () => void;
  onResetRecovery: (policy: string, entityId: string, tripwireIndex: number) => void;
  workflows: readonly { name: string }[];
  onRunWorkflow: (cameraId: string, workflowName: string) => void;
}) {
  const videoCaptureDeviceId = O.toUndefined(camera.videoCaptureDeviceId);
  const adbAddress = camera.adb ? Network.format(camera.adb.target) : undefined;
  const hasSuitest = Boolean(camera.suitest && videoCaptureDeviceId);
  const hasAdb = Boolean(camera.adb && adbAddress);

  // entityId vuoto quando suitest/adb non e' collegato: nessuna entry trovata, colorFor
  // ricade su "disabled" - hook comunque chiamati sempre (rules-of-hooks).
  const suitestStatus = usePredicateStat({
    domain: RECOVERY_DOMAIN,
    entityId: videoCaptureDeviceId ?? "",
    name: "suitest_camera_connected",
    colorFor: (value) => (value === undefined ? "disabled" : value ? "success" : "error"),
    detail: (value) => (value === undefined ? "unknown" : value ? "online" : "offline"),
  });
  const recording = usePredicateStat({
    domain: RECOVERY_DOMAIN,
    entityId: videoCaptureDeviceId ?? "",
    name: "suitest_camera_recording",
    colorFor: (value) => (value === undefined ? "disabled" : value ? "error" : "disabled"),
    detail: (value) => (value ? "active" : "idle"),
  });
  const streaming = usePredicateStat({
    domain: RECOVERY_DOMAIN,
    entityId: videoCaptureDeviceId ?? "",
    name: "suitest_camera_streaming",
    colorFor: (value) => (value === undefined ? "disabled" : value ? "info" : "disabled"),
    detail: (value) => (value ? "active" : "idle"),
  });
  const adbReachable = usePredicateStat({
    domain: "adb",
    entityId: adbAddress ?? "",
    name: "adb_device_reachable",
    colorFor: (value) => (value === undefined ? "disabled" : value ? "success" : "error"),
    detail: (value) => (value === undefined ? "unknown" : value ? "reachable" : (adbStatus ?? "unreachable")),
  });
  const recovery = useActivityStat({
    source: "recovery",
    entityId: videoCaptureDeviceId ?? "",
    colorFor: recoveryColorFor,
  });
  const adbBridge = useActivityStat({ source: "adb", entityId: camera.id, colorFor: adbBridgeColorFor });
  const lastWorkflow = useActivityStat({
    source: "manual-workflow",
    entityId: camera.id,
    colorFor: workflowRunColorFor,
  });

  const details: DetailItem[] = [
    ...(hasSuitest
      ? [
          { label: "Camera status", value: suitestStatus.detailText, tone: suitestStatus.tone },
          { label: "Recording", value: recording.detailText, tone: recording.tone },
          { label: "Streaming", value: streaming.detailText, tone: streaming.tone },
          { label: "Recovery", value: recovery.detailText, tone: recovery.tone },
        ]
      : []),
    ...(hasAdb
      ? [
          { label: "ADB status", value: adbReachable.detailText, tone: adbReachable.tone },
          { label: "ADB bridge", value: adbBridge.detailText, tone: adbBridge.tone },
          { label: "Last workflow", value: lastWorkflow.detailText, tone: lastWorkflow.tone },
        ]
      : []),
  ];

  const summary = hasSuitest
    ? `${suitestStatus.detailText} · Recording ${recording.detailText} · Recovery ${recovery.detailText}`
    : hasAdb
      ? `ADB ${adbReachable.detailText}`
      : "Not linked";

  const status = hasSuitest ? suitestStatus : hasAdb ? adbReachable : undefined;

  return (
    <EntryCard
      icon={<Videocam fontSize="small" />}
      title={camera.label}
      subtitle={
        camera.suitest?.customName && camera.suitest.customName !== camera.label ? camera.suitest.customName : undefined
      }
      status={status && <StatusPill label={status.detailText.toUpperCase()} tone={status.tone} />}
      summary={summary}
      details={details}
      expandedActions={
        <>
          <RecoveryInterventionBadge domain={RECOVERY_DOMAIN} entityId={videoCaptureDeviceId ?? ""} />
          {hasSuitest ? (
            <RecoveryResetButtons
              domain={RECOVERY_DOMAIN}
              entityId={videoCaptureDeviceId ?? ""}
              onReset={onResetRecovery}
            />
          ) : (
            <Button size="small" variant="outlined" startIcon={<LinkIcon fontSize="small" />} onClick={onLink}>
              Link Suitest
            </Button>
          )}
          {hasAdb ? (
            <>
              <Button size="small" variant="outlined" startIcon={<Usb fontSize="small" />} onClick={onAssign}>
                Change ADB
              </Button>
              <WorkflowLauncher workflows={workflows} onLaunch={(name) => onRunWorkflow(camera.id, name)} />
            </>
          ) : (
            <Button size="small" variant="outlined" startIcon={<Usb fontSize="small" />} onClick={onAssign}>
              Assign ADB
            </Button>
          )}
          <ControlToggleButton
            controlled={camera.controlled}
            onToggle={() => onToggle("camera", camera.id, camera.controlled)}
          />
        </>
      }
      actions={
        <>
          <Button size="small" onClick={() => onEdit("camera", camera.id, camera.label)}>
            Edit
          </Button>
          <Button size="small" color="error" onClick={() => onDelete("camera", camera.id)}>
            Delete
          </Button>
        </>
      }
    />
  );
}
