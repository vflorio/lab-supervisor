import { CameraRow } from "@supervisor/ui/registry/index";
import { toCameraEntry, useCameraRowData } from "../rowData";
import type { CameraView } from "../types";
import type { RegistryController } from "../useRegistryController";

type Controller = Pick<
  RegistryController,
  | "handleToggle"
  | "startEdit"
  | "handleDelete"
  | "setAssigningCamera"
  | "handleLinkCamera"
  | "handleRunWorkflow"
  | "handleResetRecovery"
>;

export function CameraRowContainer({
  camera,
  workflows,
  controller,
}: {
  camera: CameraView;
  workflows: readonly string[];
  controller: Controller;
}) {
  const data = useCameraRowData(camera, controller.handleResetRecovery);

  return (
    <CameraRow
      camera={toCameraEntry(camera)}
      {...data}
      workflows={workflows}
      onToggle={() => controller.handleToggle("camera", camera.id, camera.controlled)}
      onEdit={() => controller.startEdit("camera", camera.id, camera.label)}
      onDelete={() => controller.handleDelete("camera", camera.id)}
      onAssignAdb={() => controller.setAssigningCamera(camera)}
      onLinkSuitest={() => controller.handleLinkCamera(camera)}
      onRunWorkflow={camera.adb ? (name) => controller.handleRunWorkflow(camera.id, name) : undefined}
    />
  );
}
