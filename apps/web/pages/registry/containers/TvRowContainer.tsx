import { TvRow } from "@supervisor/ui/registry/index";
import { toTvEntry, useTvRowData } from "../rowData";
import type { TvGroup } from "../types";
import type { RegistryController } from "../useRegistryController";
import { CameraRowContainer } from "./CameraRowContainer";

type Controller = Pick<
  RegistryController,
  | "handleToggle"
  | "startEdit"
  | "handleDelete"
  | "setAssigningCamera"
  | "handleLinkCamera"
  | "setLinkingTv"
  | "handleRunWorkflow"
  | "handleResetRecovery"
>;

export function TvRowContainer({
  group,
  workflows,
  controller,
}: {
  group: TvGroup;
  workflows: readonly string[];
  controller: Controller;
}) {
  const data = useTvRowData(group.tv, controller.handleResetRecovery);

  return (
    <TvRow
      tv={toTvEntry(group.tv)}
      {...data}
      onToggle={() => controller.handleToggle("tv", group.tv.deviceId, group.tv.controlled)}
      onEdit={() => controller.startEdit("tv", group.tv.deviceId, group.tv.label)}
      onDelete={() => controller.handleDelete("tv", group.tv.deviceId)}
      onLinkCamera={!group.cameras.length ? () => controller.setLinkingTv(group.tv) : undefined}
    >
      {group.cameras.map((camera) => (
        <CameraRowContainer key={camera.id} camera={camera} workflows={workflows} controller={controller} />
      ))}
    </TvRow>
  );
}
