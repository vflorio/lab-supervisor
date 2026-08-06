import * as Network from "@supervisor/core/network";
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
  | "handleProvisionAgent"
  | "provisioningConfigured"
  | "isProvisioning"
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
  // Il provisioning si rivolge al device, non al ruolo camera: senza un host ADB assegnato
  // non c'è nulla con cui parlare, quindi niente bottone.
  const adbTarget = camera.adb ? Network.format(camera.adb.target) : undefined;

  return (
    <CameraRow
      camera={toCameraEntry(camera)}
      {...data}
      workflows={workflows}
      provisioningConfigured={controller.provisioningConfigured}
      provisioningBusy={adbTarget ? controller.isProvisioning(adbTarget) : false}
      onProvisionAgent={adbTarget ? () => controller.handleProvisionAgent(adbTarget) : undefined}
      onToggle={() => controller.handleToggle("camera", camera.id, camera.controlled)}
      onEdit={() => controller.startEdit("camera", camera.id, camera.label)}
      onDelete={() => controller.handleDelete("camera", camera.id)}
      onAssignAdb={() => controller.setAssigningCamera(camera)}
      onLinkSuitest={() => controller.handleLinkCamera(camera)}
      onRunWorkflow={camera.adb ? (name) => controller.handleRunWorkflow(camera.id, name) : undefined}
    />
  );
}
