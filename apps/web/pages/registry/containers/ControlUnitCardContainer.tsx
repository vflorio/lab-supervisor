import { ControlUnitCard } from "@supervisor/ui/registry/index";
import { toControlUnitEntry, useControlUnitRowData } from "../rowData";
import type { CuGroup } from "../types";
import type { RegistryRowActions } from "../useRegistryController";
import { TvRowContainer } from "./TvRowContainer";

export function ControlUnitCardContainer({
  group,
  workflows,
  controller,
}: {
  group: CuGroup;
  workflows: readonly string[];
  controller: RegistryRowActions;
}) {
  const data = useControlUnitRowData(group.cu, controller.interventions.resetRecovery);

  return (
    <ControlUnitCard
      cu={toControlUnitEntry(group.cu)}
      {...data}
      onToggle={() => controller.devices.toggle("candybox", group.cu.id, group.cu.controlled)}
      onEdit={() => controller.rename.start("candybox", group.cu.id, group.cu.label)}
      onDelete={() => controller.devices.remove("candybox", group.cu.id)}
    >
      {group.tvs.map((tvGroup) => (
        <TvRowContainer key={tvGroup.tv.deviceId} group={tvGroup} workflows={workflows} controller={controller} />
      ))}
    </ControlUnitCard>
  );
}
