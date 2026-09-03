import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import type * as Network from "@supervisor/core/network";
import { SelectDialog } from "@supervisor/ui/misc/SelectDialog";
import {
  AddDeviceDialog,
  AssignCameraDialog,
  DeviceRegistryHeader,
  UnlinkedSection,
} from "@supervisor/ui/registry/index";
import * as O from "fp-ts/Option";
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
  const { registry, adbDevices, workflows, adbPort } = useData<Data>();
  const liveAdbDevices = useAdbDevices(adbDevices.ok ? adbDevices.data : []);

  return match(registry)
    .with({ ok: true }, ({ data }) => (
      <RegistryBody db={data} adbDevices={liveAdbDevices} workflows={workflows} adbPort={adbPort} />
    ))
    .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
    .exhaustive();
}

// Corpo condiviso tra la route "/" e "/registry-v3" (vedi RegistryHeartbeat.tsx, che aggiunge
// solo la ServiceStrip sopra questo stesso albero).
export function RegistryBody({
  db,
  adbDevices,
  workflows,
  adbPort,
}: {
  db: Database;
  adbDevices: readonly AdbDevice[];
  workflows: readonly { name: string }[];
  adbPort: Network.PORT;
}) {
  const controller = useRegistryController(db, adbDevices, workflows, adbPort);
  const { inventory, rename, adb, assignAdb, editAdbIp, linkSuitest, linkTvCamera } = controller;
  const workflowNames = workflows.map((w) => w.name);
  const assigningCameraAdbId = assignAdb.camera ? O.toUndefined(assignAdb.camera.adbId) : undefined;

  return (
    <Box sx={{ px: 3, py: 3 }}>
      <DeviceRegistryHeader
        controlUnitCount={inventory.counts.controlUnits}
        tvCount={inventory.counts.tvs}
        cameraCount={inventory.counts.cameras}
        controlledCount={inventory.counts.controlled}
        onAddDevice={() => adb.add.setOpen(true)}
      />

      {controller.error.message && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={controller.error.dismiss}>
          {controller.error.message}
        </Alert>
      )}

      <Stack spacing={2} sx={{ mt: 2 }}>
        {inventory.cuGroups.map((group) => (
          <ControlUnitCardContainer key={group.cu.id} group={group} workflows={workflowNames} controller={controller} />
        ))}

        <UnlinkedSection count={inventory.unallocatedTvs.length + inventory.orphanCameras.length}>
          {inventory.unallocatedTvs.map((tvGroup) => (
            <TvRowContainer
              key={tvGroup.tv.deviceId}
              group={tvGroup}
              workflows={workflowNames}
              controller={controller}
            />
          ))}
          {inventory.orphanCameras.map((camera) => (
            <CameraRowContainer key={camera.id} camera={camera} workflows={workflowNames} controller={controller} />
          ))}
        </UnlinkedSection>
      </Stack>

      {/* Edit label dialog */}
      <Dialog open={rename.target !== null} onClose={rename.cancel}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={rename.draft}
            onChange={(e) => rename.setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && rename.save()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={rename.cancel}>Cancel</Button>
          <Button onClick={rename.save} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add ADB target dialog */}
      <AddDeviceDialog
        open={adb.add.open}
        device={adb.add.form}
        onChange={adb.add.setForm}
        onAdd={adb.add.submit}
        onClose={() => adb.add.setOpen(false)}
      />

      {/* Assign camera <-> adb host dialog: candidati da registry.adb (non solo raggiungibili
          in questo momento) - un target appena creato manualmente non è ancora connesso finché
          non è assegnato a una camera controlled, il bridge lo connette al reconcile successivo */}
      <AssignCameraDialog
        open={assignAdb.camera !== null}
        cameraLabel={assignAdb.camera?.label}
        selectedAdbId={assigningCameraAdbId}
        candidates={Object.values(db.lab.adb)
          .filter((entry) => entry.id === assigningCameraAdbId || !adb.usedAdbIds.has(entry.id))
          .map((entry) => ({
            id: entry.id,
            label: entry.target.ip,
            status: adb.statusFor(entry.target) ?? "disconnect",
          }))}
        onAssign={assignAdb.submit}
        onClose={assignAdb.cancel}
      />

      {/* Edit ADB IP dialog */}
      <Dialog open={editAdbIp.target !== null} onClose={editAdbIp.cancel}>
        <DialogTitle>Edit ADB IP</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            placeholder="192.168.1.100"
            value={editAdbIp.draft}
            onChange={(e) => editAdbIp.setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && editAdbIp.save()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={editAdbIp.cancel}>Cancel</Button>
          <Button onClick={editAdbIp.save} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Riconciliazione manuale: collega una camera a un video-capture-device Suitest */}
      <SelectDialog
        open={linkSuitest.target !== null}
        title="Link Suitest video capture device"
        selectedId={linkSuitest.target?.currentVideoCaptureDeviceId}
        options={linkSuitest.candidates}
        emptyMessage={
          <>
            Nessun device Suitest disponibile per il collegamento.
            <br />
            Verifica che la sync con Suitest sia andata a buon fine.
          </>
        }
        onSelect={linkSuitest.submit}
        onClose={linkSuitest.cancel}
      />

      {/* Riconciliazione manuale invertita: collega una camera orfana a una TV */}
      <SelectDialog
        open={linkTvCamera.target !== null}
        title={`Link camera${linkTvCamera.target ? ` - ${linkTvCamera.target.label}` : ""}`}
        options={linkTvCamera.candidates}
        emptyMessage={
          <>
            Nessuna camera locale orfana da collegare a questa TV.
            <br />
            Verifica che Suitest abbia già assegnato un video-capture-device a questa TV e che esista una camera locale
            non ancora collegata.
          </>
        }
        onSelect={linkTvCamera.submit}
        onClose={linkTvCamera.cancel}
      />
    </Box>
  );
}
