import { ControlUnitCard } from "@supervisor/ui/registry/index";
import { toControlUnitEntry, useControlUnitRowData } from "../rowData";
import type { CuGroup } from "../types";
import type { RegistryController } from "../useRegistryController";
import { TvRowContainer } from "./TvRowContainer";

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

export function ControlUnitCardContainer({
  group,
  workflows,
  controller,
}: {
  group: CuGroup;
  workflows: readonly string[];
  controller: Controller;
}) {
  const data = useControlUnitRowData(group.cu, controller.handleResetRecovery);

  return (
    <ControlUnitCard
      cu={toControlUnitEntry(group.cu)}
      {...data}
      onToggle={() => controller.handleToggle("candybox", group.cu.id, group.cu.controlled)}
      onEdit={() => controller.startEdit("candybox", group.cu.id, group.cu.label)}
      onDelete={() => controller.handleDelete("candybox", group.cu.id)}
    >
      {group.tvs.map((tvGroup) => (
        <TvRowContainer key={tvGroup.tv.deviceId} group={tvGroup} workflows={workflows} controller={controller} />
      ))}
    </ControlUnitCard>
  );
}
