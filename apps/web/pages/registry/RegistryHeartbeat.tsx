import { Add } from "@mui/icons-material";
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
import type { LoopEntry } from "@supervisor/core/task-runner/model";
import { entryRowGridSx } from "@supervisor/ui/misc/EntryRow";
import { PageHeader } from "@supervisor/ui/registry/index";
import { type LoopWidgetProps, ServiceStrip } from "@supervisor/ui/task-runner";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import { useLoops } from "../../hooks/useLoops";
import type { Data } from "../index/+data";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { AssignCameraDialog } from "./AssignCameraDialog";
import { CameraRow } from "./CameraRow";
import { ControlUnitCard } from "./ControlUnitCard";
import { LinkSuitestDialog } from "./LinkSuitestDialog";
import { TvRow } from "./TvRow";
import type { Database } from "./types";
import { useRegistryController } from "./useRegistryController";

// Stessa business logic di Registry.tsx (useRegistryController) e stesse righe EntryRow -
// aggiunge solo la ServiceStrip in cima e l'header nello stile Settings. Route separata
// (/registry-v3) per confrontarla con le altre due senza toccarle.

// Unico punto in cui una LoopEntry (wire type di @supervisor/core/task-runner) diventa un
// LoopWidgetProps - `status` si chiama `state` lato UI, il resto passa 1:1.
const toLoopWidgetProps = (entry: LoopEntry): LoopWidgetProps => ({
  id: entry.id,
  label: entry.label,
  state: entry.status,
  iteration: entry.iteration,
  lastTickAt: entry.lastTickAt,
  nextTickAt: entry.nextTickAt,
  delayMs: entry.delayMs,
  policyLabel: entry.policyLabel,
  detail: entry.detail,
});

export function RegistryHeartbeatView() {
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

  const loops = useLoops();

  return (
    <Box sx={{ maxHeight: "calc(100vh - 64px)", overflowY: "auto" }}>
      <ServiceStrip connection={loops.status} loops={Array.from(loops.table.values()).map(toLoopWidgetProps)} />

      <Box sx={{ px: 3, py: 3 }}>
        <PageHeader
          eyebrow="Registry"
          title="Device Registry"
          actions={
            <>
              <Chip label={`${totalDevices} devices`} size="small" />
              <Chip label={`${totalControlled} controlled`} size="small" color="primary" />
              <IconButton onClick={() => setAddOpen(true)} color="primary" title="Add ADB Target">
                <Add />
              </IconButton>
            </>
          }
        />

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
      </Box>
    </Box>
  );
}
