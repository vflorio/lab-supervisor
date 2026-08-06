import { TvRow } from "@supervisor/ui/registry/index";
import { toTvEntry, useTvRowData } from "../rowData";
import type { TvGroup } from "../types";
import type { RegistryRowActions } from "../useRegistryController";
import { CameraRowContainer } from "./CameraRowContainer";

export function TvRowContainer({
  group,
  workflows,
  controller,
}: {
  group: TvGroup;
  workflows: readonly string[];
  controller: RegistryRowActions;
}) {
  const data = useTvRowData(group.tv, controller.interventions.resetRecovery);

  return (
    <TvRow
      tv={toTvEntry(group.tv)}
      {...data}
      onToggle={() => controller.devices.toggle("tv", group.tv.deviceId, group.tv.controlled)}
      onEdit={() => controller.rename.start("tv", group.tv.deviceId, group.tv.label)}
      onDelete={() => controller.devices.remove("tv", group.tv.deviceId)}
      onLinkCamera={!group.cameras.length ? () => controller.linkTvCamera.start(group.tv) : undefined}
    >
      {group.cameras.map((camera) => (
        <CameraRowContainer key={camera.id} camera={camera} workflows={workflows} controller={controller} />
      ))}
    </TvRow>
  );
}
