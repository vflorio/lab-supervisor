import * as Network from "@supervisor/core/network";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import { useState } from "react";
import { match } from "ts-pattern";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import { useServiceLogger } from "../../hooks/useServiceLogger";
import { trpc } from "../../trpc/client";
import { adbStatusFor, buildHierarchy, cameraSuitestCandidates } from "./hierarchy";
import { mutate, mutations } from "./mutations";
import type { CameraView, Database, DeviceKind, LinkingTarget, NewAdbTargetForm } from "./types";

// Estratto da Registry.tsx: cosi' Registry.tsx e RegistryTree.tsx riusano la stessa
// business logic e differiscono solo nel rendering.
const emptyNewAdbTarget: NewAdbTargetForm = { label: "", target: "" };

export function useRegistryController(
  db: Database,
  adbDevices: readonly AdbDevice[],
  workflows: readonly { name: string }[],
) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: DeviceKind; id: string; label: string } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newAdbTarget, setNewAdbTarget] = useState<NewAdbTargetForm>(emptyNewAdbTarget);
  const [assigningCamera, setAssigningCamera] = useState<CameraView | null>(null);
  const [linking, setLinking] = useState<LinkingTarget | null>(null);
  const log = useServiceLogger();

  const handleToggle = (kind: DeviceKind, id: string, controlled: boolean) => {
    log(`User ${controlled ? "disabled" : "enabled"} control of ${kind} ${id}`);
    return mutate(
      () =>
        match(kind)
          .with("candybox", () => mutations.candybox.update.mutate({ id, controlled: !controlled }))
          .with("camera", () => mutations.camera.update.mutate({ id, controlled: !controlled }))
          .with("tv", () => mutations.tv.update.mutate({ deviceId: id, controlled: !controlled }))
          .exhaustive(),
      setError,
    );
  };

  const handleSaveLabel = () =>
    mutate(async () => {
      if (!editing) return { ok: false as const, error: { type: "ValidationError", message: "Nothing to edit" } };

      log(`User renamed ${editing.kind} ${editing.id} to "${editLabel}"`);
      const result = await match(editing.kind)
        .with("candybox", () => mutations.candybox.update.mutate({ id: editing.id, label: editLabel }))
        .with("camera", () => mutations.camera.update.mutate({ id: editing.id, label: editLabel }))
        .with("tv", () => mutations.tv.update.mutate({ deviceId: editing.id, label: editLabel }))
        .exhaustive();
      if (result.ok) setEditing(null);
      return result;
    }, setError);

  const handleDelete = (kind: DeviceKind, id: string) => {
    log(`User deleted ${kind} ${id}`, "warn");
    return mutate(
      () =>
        match(kind)
          .with("candybox", () => mutations.candybox.remove.mutate(id))
          .with("camera", () => mutations.camera.remove.mutate(id))
          .with("tv", () => mutations.tv.remove.mutate(id))
          .exhaustive(),
      setError,
    );
  };

  // Assegna un host ADB a una camera: upsert (idempotente, chiave = target stesso) del target
  // nel registro `adb`, poi collega la camera via foreign key `adbId`.
  const handleAssign = (target: string) =>
    mutate(async () => {
      if (!assigningCamera) return { ok: false as const, error: { type: "ValidationError", message: "No camera" } };

      const decoded = Network.decode(target);
      if (E.isLeft(decoded)) return { ok: false as const, error: decoded.left };

      const id = Network.format(decoded.right);
      log(`User assigned ADB host ${id} to camera ${assigningCamera.id}`);
      const addResult = await mutations.adb.add.mutate({ id, label: id, target: id });
      if (!addResult.ok) return addResult;

      const result = await mutations.camera.update.mutate({ id: assigningCamera.id, adbId: id });
      if (result.ok) setAssigningCamera(null);
      return result;
    }, setError);

  const handleLinkSuitest = (videoCaptureDeviceId: string) =>
    mutate(async () => {
      if (!linking) return { ok: false as const, error: { type: "ValidationError", message: "Nothing to link" } };

      log(`User linked Suitest video-capture-device ${videoCaptureDeviceId} to camera ${linking.id}`);
      const result = await mutations.camera.update.mutate({
        id: linking.id,
        videoCaptureDeviceId,
      });
      if (result.ok) setLinking(null);
      return result;
    }, setError);

  // Riarma un tripwire "exhausted" (intervento manuale): a differenza delle altre mutation di
  // questa view non fa `reload()` (mutate()) - non tocca il registry su disco, l'esito arriva
  // dallo stream live di recovery/activity già sottoscritto (vedi RecoveryIntervention.tsx).
  const handleResetRecovery = (policy: string, entityId: string, tripwireIndex: number) => {
    log(`User reset recovery tripwire for ${entityId} (policy "${policy}")`, "warn");
    void trpc.recovery.reset.mutate({ policy, entityId, tripwireIndex }).then((succeeded) => {
      if (!succeeded) setError(`Reset failed: no active recovery runner for "${entityId}"`);
    });
  };

  // Lancio manuale di un workflow (intervento operatore): come handleResetRecovery, non tocca
  // il registry su disco - l'esito arriva dallo stream live di activity (source "manual-workflow").
  const handleRunWorkflow = (cameraId: string, workflowName: string) => {
    log(`User launched workflow "${workflowName}" on camera ${cameraId}`);
    void trpc.workflow.run.mutate({ cameraId, workflowName }).then((result) => {
      if (!result.ok) setError(`Workflow failed: ${result.error.message}`);
    });
  };

  const handleAdd = () =>
    mutate(async () => {
      if (!newAdbTarget.label)
        return { ok: false as const, error: { type: "ValidationError", message: "Label required" } };

      const decoded = Network.decode(newAdbTarget.target);
      if (E.isLeft(decoded)) return { ok: false as const, error: decoded.left };

      const id = Network.format(decoded.right);
      log(`User added ADB target ${id} ("${newAdbTarget.label}")`);
      const result = await mutations.adb.add.mutate({ id, label: newAdbTarget.label, target: id });

      if (result.ok) {
        setAddOpen(false);
        setNewAdbTarget(emptyNewAdbTarget);
      }
      return result;
    }, setError);

  const startEdit = (kind: DeviceKind, id: string, label: string) => {
    setEditing({ kind, id, label });
    setEditLabel(label);
  };

  const handleLinkCamera = (camera: CameraView) =>
    setLinking({ id: camera.id, currentVideoCaptureDeviceId: O.toUndefined(camera.videoCaptureDeviceId) });

  const { cuGroups, unallocatedTvs, orphanCameras } = buildHierarchy(db);

  const controlUnitCount = Object.keys(db.lab.candyboxes).length;
  const tvCount = Object.keys(db.lab.tvs).length;
  const cameraCount = Object.keys(db.lab.cameras).length;
  const totalDevices = controlUnitCount + cameraCount + tvCount;

  const totalControlled =
    Object.values(db.lab.candyboxes).filter((d) => d.controlled).length +
    Object.values(db.lab.cameras).filter((d) => d.controlled).length +
    Object.values(db.lab.tvs).filter((d) => d.controlled).length;

  const usedAdbTargets = new Set(
    Object.values(db.lab.cameras)
      .map((c) =>
        pipe(
          c.adbId,
          O.chain((id) => O.fromNullable(db.lab.adb[id])),
          O.map((entry) => Network.format(entry.target)),
        ),
      )
      .filter(O.isSome)
      .map((o) => o.value),
  );

  const linkCandidates = linking ? cameraSuitestCandidates(db, linking.currentVideoCaptureDeviceId) : [];

  return {
    error,
    setError,
    editing,
    editLabel,
    setEditLabel,
    startEdit,
    cancelEdit: () => setEditing(null),
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
    controlUnitCount,
    tvCount,
    cameraCount,
    totalDevices,
    totalControlled,
    usedAdbTargets,
    linkCandidates,
    adbDevices,
    workflows,
    adbStatusFor: (target: Parameters<typeof adbStatusFor>[1]) => adbStatusFor(adbDevices, target),
  };
}

export type RegistryController = ReturnType<typeof useRegistryController>;
