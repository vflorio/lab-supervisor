import * as Network from "@supervisor/core/network";
import { CameraRow } from "@supervisor/ui/registry/index";
import { toCameraEntry, useCameraRowData } from "../rowData";
import type { CameraView } from "../types";
import type { RegistryRowActions } from "../useRegistryController";

export function CameraRowContainer({
  camera,
  workflows,
  controller,
}: {
  camera: CameraView;
  workflows: readonly string[];
  controller: RegistryRowActions;
}) {
  const data = useCameraRowData(camera, controller.interventions.resetRecovery);
  // Il provisioning si rivolge al device, non al ruolo camera: senza un host ADB assegnato
  // non c'è nulla con cui parlare, quindi niente bottone.
  const adbTarget = camera.adb ? Network.format(camera.adb.target) : undefined;

  return (
    <CameraRow
      camera={toCameraEntry(camera)}
      {...data}
      workflows={workflows}
      provisioningConfigured={controller.provisioning.configured}
      provisioningBusy={adbTarget ? controller.provisioning.isBusy(adbTarget) : false}
      onProvisionAgent={adbTarget ? () => controller.provisioning.start(adbTarget) : undefined}
      onToggle={() => controller.devices.toggle("camera", camera.id, camera.controlled)}
      onEdit={() => controller.rename.start("camera", camera.id, camera.label)}
      onDelete={() => controller.devices.remove("camera", camera.id)}
      onAssignAdb={() => controller.assignAdb.start(camera)}
      onLinkSuitest={() => controller.linkSuitest.start(camera)}
      onRunWorkflow={camera.adb ? (name) => controller.interventions.runWorkflow(camera.id, name) : undefined}
    />
  );
}
