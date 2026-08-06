import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import * as Network from "@supervisor/core/network";
import { SelectDialog } from "@supervisor/ui/misc/SelectDialog";
import {
  AddDeviceDialog,
  AssignCameraDialog,
  DeviceRegistryHeader,
  UnlinkedSection,
} from "@supervisor/ui/registry/index";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import type { Data } from "../index/+data";
import { CameraRowContainer } from "./containers/CameraRowContainer";
import { ControlUnitCardContainer } from "./containers/ControlUnitCardContainer";
import { TvRowContainer } from "./containers/TvRowContainer";
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
  const assigningCameraTarget = controller.assigningCamera?.adb
    ? Network.format(controller.assigningCamera.adb.target)
    : undefined;

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

      {/* Assign camera <-> adb host dialog: candidati da registry.adb (non solo raggiungibili
          in questo momento) - un target appena creato manualmente non è ancora connesso finché
          non è assegnato a una camera controlled, il bridge lo connette al reconcile successivo */}
      <AssignCameraDialog
        open={controller.assigningCamera !== null}
        cameraLabel={controller.assigningCamera?.label}
        selectedTarget={assigningCameraTarget}
        candidates={Object.values(db.lab.adb)
          .filter((entry) => entry.id === assigningCameraTarget || !controller.usedAdbTargets.has(entry.id))
          .map((entry) => ({ target: entry.id, status: controller.adbStatusFor(entry.target) ?? "disconnect" }))}
        onAssign={controller.handleAssign}
        onClose={() => controller.setAssigningCamera(null)}
      />

      {/* Riconciliazione manuale: collega una camera a un video-capture-device Suitest */}
      <SelectDialog
        open={controller.linking !== null}
        title="Link Suitest video capture device"
        selectedId={controller.linking?.currentVideoCaptureDeviceId}
        options={controller.linkCandidates}
        emptyMessage={
          <>
            Nessun device Suitest disponibile per il collegamento.
            <br />
            Verifica che la sync con Suitest sia andata a buon fine.
          </>
        }
        onSelect={controller.handleLinkSuitest}
        onClose={() => controller.setLinking(null)}
      />

      {/* Riconciliazione manuale invertita: collega una camera orfana a una TV */}
      <SelectDialog
        open={controller.linkingTv !== null}
        title={`Link camera${controller.linkingTv ? ` - ${controller.linkingTv.label}` : ""}`}
        options={controller.linkTvCandidates}
        emptyMessage={
          <>
            Nessuna camera locale orfana da collegare a questa TV.
            <br />
            Verifica che Suitest abbia già assegnato un video-capture-device a questa TV e che esista una camera locale
            non ancora collegata.
          </>
        }
        onSelect={controller.handleLinkCameraToTv}
        onClose={() => controller.setLinkingTv(null)}
      />
    </Box>
  );
}
