import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { DeviceRegistryHeader, UnlinkedSection } from "@supervisor/ui/registry/index";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import type { Data } from "../index/+data";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { AssignCameraDialog } from "./AssignCameraDialog";
import { CameraRowContainer } from "./CameraRowContainer";
import { ControlUnitCardContainer } from "./ControlUnitCardContainer";
import { LinkCameraToTvDialog } from "./LinkCameraToTvDialog";
import { LinkSuitestDialog } from "./LinkSuitestDialog";
import { TvRowContainer } from "./TvRowContainer";
import type { Database } from "./types";
import { useRegistryController } from "./useRegistryController";

// -------------------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------------------

export function RegistryView() {
  const { registry, adbDevices, workflows } = useData<Data>();
  const liveAdbDevices = useAdbDevices(adbDevices.ok ? adbDevices.data : []);

  return match(registry)
    .with({ ok: true }, ({ data }) => <RegistryBody db={data} adbDevices={liveAdbDevices} workflows={workflows} />)
    .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
    .exhaustive();
}

// Corpo condiviso tra la route "/" e "/registry-v3" (vedi RegistryHeartbeat.tsx, che aggiunge
// solo la ServiceStrip sopra questo stesso albero).
export function RegistryBody({
  db,
  adbDevices,
  workflows,
}: {
  db: Database;
  adbDevices: readonly AdbDevice[];
  workflows: readonly { name: string }[];
}) {
  const controller = useRegistryController(db, adbDevices, workflows);
  const workflowNames = workflows.map((w) => w.name);

  return (
    <Box sx={{ px: 3, py: 3 }}>
      <DeviceRegistryHeader
        controlUnitCount={controller.controlUnitCount}
        tvCount={controller.tvCount}
        cameraCount={controller.cameraCount}
        controlledCount={controller.totalControlled}
        onAddDevice={() => controller.setAddOpen(true)}
      />

      {controller.error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => controller.setError(null)}>
          {controller.error}
        </Alert>
      )}

      <Stack spacing={2} sx={{ mt: 2 }}>
        {controller.cuGroups.map((group) => (
          <ControlUnitCardContainer key={group.cu.id} group={group} workflows={workflowNames} controller={controller} />
        ))}

        <UnlinkedSection count={controller.unallocatedTvs.length + controller.orphanCameras.length}>
          {controller.unallocatedTvs.map((tvGroup) => (
            <TvRowContainer
              key={tvGroup.tv.deviceId}
              group={tvGroup}
              workflows={workflowNames}
              controller={controller}
            />
          ))}
          {controller.orphanCameras.map((camera) => (
            <CameraRowContainer key={camera.id} camera={camera} workflows={workflowNames} controller={controller} />
          ))}
        </UnlinkedSection>
      </Stack>

      {/* Edit label dialog */}
      <Dialog open={controller.editing !== null} onClose={controller.cancelEdit}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={controller.editLabel}
            onChange={(e) => controller.setEditLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && controller.handleSaveLabel()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={controller.cancelEdit}>Cancel</Button>
          <Button onClick={controller.handleSaveLabel} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add ADB target dialog */}
      <AddDeviceDialog
        open={controller.addOpen}
        device={controller.newAdbTarget}
        onChange={controller.setNewAdbTarget}
        onAdd={controller.handleAdd}
        onClose={() => controller.setAddOpen(false)}
      />

      {/* Assign camera <-> adb host dialog */}
      <AssignCameraDialog
        camera={controller.assigningCamera}
        adbDevices={adbDevices}
        usedTargets={controller.usedAdbTargets}
        onAssign={controller.handleAssign}
        onClose={() => controller.setAssigningCamera(null)}
      />

      {/* Riconciliazione manuale: collega una camera a un video-capture-device Suitest */}
      <LinkSuitestDialog
        target={controller.linking}
        candidates={controller.linkCandidates}
        onLink={controller.handleLinkSuitest}
        onClose={() => controller.setLinking(null)}
      />

      {/* Riconciliazione manuale invertita: collega una camera orfana a una TV */}
      <LinkCameraToTvDialog
        tv={controller.linkingTv}
        candidates={controller.linkTvCandidates}
        onLink={controller.handleLinkCameraToTv}
        onClose={() => controller.setLinkingTv(null)}
      />
    </Box>
  );
}
