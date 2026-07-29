import { Add, Devices } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { entryRowGridSx } from "@supervisor/ui/EntryRow";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import { Panel } from "../../layout/Panel";
import type { Data } from "../index/+data";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { AssignCameraDialog } from "./AssignCameraDialog";
import { CameraRow } from "./CameraRow";
import { ControlUnitCard } from "./ControlUnitCard";
import { LinkSuitestDialog } from "./LinkSuitestDialog";
import { TvRow } from "./TvRow";
import type { Database } from "./types";
import { useRegistryController } from "./useRegistryController";

// -------------------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------------------

export function RegistryView() {
  const { registry, adbDevices, workflows } = useData<Data>();
  const liveAdbDevices = useAdbDevices(adbDevices.ok ? adbDevices.data : []);

  return match(registry)
    .with({ ok: true }, ({ data }) => <HierarchyView db={data} adbDevices={liveAdbDevices} workflows={workflows} />)
    .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
    .exhaustive();
}

function HierarchyView({
  db,
  adbDevices,
  workflows,
}: {
  db: Database;
  adbDevices: readonly AdbDevice[];
  workflows: readonly { name: string }[];
}) {
  const {
    error,
    setError,
    editing,
    editLabel,
    setEditLabel,
    startEdit,
    cancelEdit,
    handleSaveLabel,
    addOpen,
    setAddOpen,
    newAdbTarget,
    setNewAdbTarget,
    handleAdd,
    assigningCamera,
    setAssigningCamera,
    handleAssign,
    linking,
    setLinking,
    handleLinkSuitest,
    handleLinkCamera,
    handleToggle,
    handleDelete,
    handleResetRecovery,
    handleRunWorkflow,
    cuGroups,
    unallocatedTvs,
    orphanCameras,
    totalDevices,
    totalControlled,
    usedAdbTargets,
    linkCandidates,
    adbStatusFor,
  } = useRegistryController(db, adbDevices, workflows);

  return (
    <Panel
      title="Device Registry"
      icon={<Devices sx={{ fontSize: 16 }} />}
      actions={
        <>
          <Chip label={`${totalDevices} devices`} size="small" />
          <Chip label={`${totalControlled} controlled`} size="small" color="primary" />
          <IconButton onClick={() => setAddOpen(true)} color="primary" title="Add ADB Target">
            <Add />
          </IconButton>
        </>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        {cuGroups.map((group) => (
          <ControlUnitCard
            key={group.cu.id}
            group={group}
            adbDevices={adbDevices}
            onToggle={handleToggle}
            onEdit={startEdit}
            onDelete={handleDelete}
            onAssignCamera={setAssigningCamera}
            onLinkCamera={handleLinkCamera}
            onResetRecovery={handleResetRecovery}
            workflows={workflows}
            onRunWorkflow={handleRunWorkflow}
          />
        ))}

        <Typography variant="subtitle2" sx={{ color: "textSecondary", display: "block", mb: 1 }}>
          Unlinked
        </Typography>

        {unallocatedTvs.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: "textSecondary", display: "block", mb: 1 }}>
              TVs
            </Typography>
            <Box sx={{ ...entryRowGridSx, rowGap: 1 }}>
              {unallocatedTvs.map((tvGroup) => (
                <TvRow
                  key={tvGroup.tv.deviceId}
                  group={tvGroup}
                  adbDevices={adbDevices}
                  onToggle={handleToggle}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onAssignCamera={setAssigningCamera}
                  onLinkCamera={handleLinkCamera}
                  onResetRecovery={handleResetRecovery}
                  workflows={workflows}
                  onRunWorkflow={handleRunWorkflow}
                />
              ))}
            </Box>
          </Paper>
        )}

        {orphanCameras.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: "textSecondary", display: "block", mb: 1 }}>
              Cameras
            </Typography>
            <Box sx={{ ...entryRowGridSx, rowGap: 1 }}>
              {orphanCameras.map((camera) => (
                <CameraRow
                  key={camera.id}
                  camera={camera}
                  adbStatus={adbStatusFor(camera.adb?.target)}
                  onToggle={handleToggle}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onAssign={() => setAssigningCamera(camera)}
                  onLink={() => handleLinkCamera(camera)}
                  onResetRecovery={handleResetRecovery}
                  workflows={workflows}
                  onRunWorkflow={handleRunWorkflow}
                />
              ))}
            </Box>
          </Paper>
        )}
      </Stack>

      {/* Edit label dialog */}
      <Dialog open={editing !== null} onClose={cancelEdit}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelEdit}>Cancel</Button>
          <Button onClick={handleSaveLabel} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add ADB target dialog */}
      <AddDeviceDialog
        open={addOpen}
        device={newAdbTarget}
        onChange={setNewAdbTarget}
        onAdd={handleAdd}
        onClose={() => setAddOpen(false)}
      />

      {/* Assign camera <-> adb host dialog */}
      <AssignCameraDialog
        camera={assigningCamera}
        adbDevices={adbDevices}
        usedTargets={usedAdbTargets}
        onAssign={handleAssign}
        onClose={() => setAssigningCamera(null)}
      />

      {/* Riconciliazione manuale: collega una camera a un video-capture-device Suitest */}
      <LinkSuitestDialog
        target={linking}
        candidates={linkCandidates}
        onLink={handleLinkSuitest}
        onClose={() => setLinking(null)}
      />
    </Panel>
  );
}
