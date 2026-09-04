import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import type * as Network from "@supervisor/core/network";
import { SelectDialog } from "@supervisor/ui/misc/SelectDialog";
import { AssignAdbDialog, DeviceRegistryHeader, RegistryToolbar, UnlinkedSection } from "@supervisor/ui/registry/index";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import type { Data } from "../index/+data";
import { CameraRowContainer } from "./containers/CameraRowContainer";
import { ControlUnitCardContainer } from "./containers/ControlUnitCardContainer";
import { TvRowContainer } from "./containers/TvRowContainer";
import { ERROR_KIND_OPTIONS } from "./errorKinds";
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

// Corpo della route "/": la ServiceStrip (stato connessione + loop di background) vive nel
// pannello Overview a destra (apps/web/components/OverviewPanel.tsx), non più qui in testa.
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
  const { inventory, rename, createAdb, editAdbIp, linkSuitest, linkTvCamera, display } = controller;
  const workflowNames = workflows.map((w) => w.name);

  return (
    <Box sx={{ px: 3, py: 3 }}>
      <DeviceRegistryHeader
        controlUnitCount={inventory.counts.controlUnits}
        tvCount={inventory.counts.tvs}
        cameraCount={inventory.counts.cameras}
        controlledCount={inventory.counts.controlled}
      />

      <RegistryToolbar
        sortBy={display.sortBy}
        onSortByChange={display.setSortBy}
        visibleTypes={display.visibleTypes}
        onToggleType={display.toggleType}
        controlled={display.controlled}
        onToggleControlled={display.toggleControlled}
        inUse={display.inUse}
        onToggleInUse={display.toggleInUse}
        errorKindOptions={ERROR_KIND_OPTIONS}
        errorKinds={display.errorKinds}
        onToggleErrorKind={display.toggleErrorKind}
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

      {/* Crea l'host ADB e lo assegna alla camera in un colpo solo - niente pool di host da
          gestire a parte, ognuno nasce già legato alla camera per cui è stato registrato */}
      <AssignAdbDialog
        open={createAdb.camera !== null}
        cameraLabel={createAdb.camera?.label}
        device={createAdb.form}
        status={createAdb.status}
        onChange={createAdb.setForm}
        onAssign={createAdb.submit}
        onClose={createAdb.cancel}
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
