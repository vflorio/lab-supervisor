import { Bolt, Cable, Link as LinkIcon, Usb, Videocam } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import * as Network from "@supervisor/core/network";
import { EntryRow } from "@supervisor/ui/EntryRow";
import * as O from "fp-ts/Option";
import type { ReactNode } from "react";
import { ActivityStat } from "../../components/ActivityStat";
import { ActivityStatus } from "../../components/ActivityStatus";
import { PredicateStat } from "../../components/PredicateStat";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import { adbBridgeColorFor, recoveryColorFor, workflowColorFor } from "./activityColors";
import type { CameraView, DeviceKind } from "./types";

export function CameraRow({
  camera,
  adbStatus,
  onToggle,
  onEdit,
  onDelete,
  onAssign,
  onLink,
}: {
  camera: CameraView;
  adbStatus: AdbDevice["status"] | null;
  onToggle: (kind: DeviceKind, id: string, controlled: boolean) => void;
  onEdit: (kind: DeviceKind, id: string, label: string) => void;
  onDelete: (kind: DeviceKind, id: string) => void;
  onAssign: () => void;
  onLink: () => void;
}) {
  const connectivity: ReactNode[] = [];
  const activity: ReactNode[] = [];
  const actions: ReactNode[] = [];
  const videoCaptureDeviceId = O.toUndefined(camera.videoCaptureDeviceId);
  const adbAddress = camera.adb ? Network.format(camera.adb.target) : undefined;

  if (camera.suitest && videoCaptureDeviceId) {
    connectivity.push(
      <PredicateStat
        key="pc"
        domain="suitest-camera"
        entityId={videoCaptureDeviceId}
        name="suitest_camera_connected"
        label="Camera status"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "success" : "error")}
        detail={(value) => (value === undefined ? "unknown" : value ? "online" : "offline")}
      />,
    );
    activity.push(
      <PredicateStat
        key="pr"
        domain="suitest-camera"
        entityId={videoCaptureDeviceId}
        name="suitest_camera_recording"
        label="Recording"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "error" : "disabled")}
        detail={(value) => (value ? "active" : "idle")}
      />,
      <PredicateStat
        key="pl"
        domain="suitest-camera"
        entityId={videoCaptureDeviceId}
        name="suitest_camera_streaming"
        label="Streaming"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "info" : "disabled")}
        detail={(value) => (value ? "active" : "idle")}
      />,
    );
    activity.push(
      <ActivityStat
        key="ar"
        source="recovery"
        entityId={videoCaptureDeviceId}
        label="Tripwire"
        colorFor={recoveryColorFor}
      />,
    );
  } else {
    actions.push(
      <Button key="o" size="small" variant="outlined" startIcon={<LinkIcon fontSize="small" />} onClick={onLink}>
        Link Suitest
      </Button>,
    );
  }

  if (camera.adb && adbAddress) {
    connectivity.push(
      <PredicateStat
        key="pa"
        domain="adb"
        entityId={adbAddress}
        name="adb_device_reachable"
        label="ADB status"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "success" : "error")}
        detail={(value) => (value === undefined ? "unknown" : value ? "reachable" : (adbStatus ?? "unreachable"))}
      />,
    );
    actions.push(
      <Button key="ra" size="small" variant="outlined" startIcon={<Usb fontSize="small" />} onClick={onAssign}>
        Change ADB
      </Button>,
    );
  } else {
    actions.push(
      <Button key="a" size="small" variant="outlined" startIcon={<Usb fontSize="small" />} onClick={onAssign}>
        Assign ADB
      </Button>,
    );
  }

  return (
    <EntryRow
      icon={<Videocam fontSize="small" />}
      label={camera.label}
      secondary={
        camera.suitest?.customName && camera.suitest.customName !== camera.label ? camera.suitest.customName : undefined
      }
      checked={camera.controlled}
      checkedTitle="Controlled by supervisor"
      indicators={[...connectivity, ...activity]}
      context={
        <Stack
          direction="row"
          sx={{ width: "100%", gap: 2, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}
        >
          {adbAddress && (
            <Stack sx={{ flexDirection: "row", gap: 1, alignItems: "center", minWidth: 0 }}>
              <Usb fontSize="small" color="disabled" />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                  Assigned ADB
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap sx={{ display: "block" }}>
                  {adbAddress}
                </Typography>
              </Box>
            </Stack>
          )}
          {camera.adb && (
            <ActivityStatus
              source="adb"
              entityId={camera.id}
              label="ADB bridge"
              icon={<Cable fontSize="small" />}
              colorFor={adbBridgeColorFor}
            />
          )}
          {videoCaptureDeviceId && (
            <ActivityStatus
              source="workflow"
              entityId={videoCaptureDeviceId}
              label="Recovery workflow"
              icon={<Bolt fontSize="small" />}
              colorFor={workflowColorFor}
            />
          )}
        </Stack>
      }
      actions={actions}
      onToggle={() => onToggle("camera", camera.id, camera.controlled)}
      onEdit={() => onEdit("camera", camera.id, camera.label)}
      onDelete={() => onDelete("camera", camera.id)}
    />
  );
}
