import { ControlUnitCard } from "@supervisor/ui/registry/index";
import { controlUnitErrorKinds } from "../errorKinds";
import { toControlUnitEntry, useControlUnitRowData } from "../rowData";
import type { CuGroup } from "../types";
import type { RegistryRowActions } from "../useRegistryController";
import { matchesFilters } from "../useRegistryFilters";
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
  const showRow = matchesFilters(controller.display, "candybox", group.cu, controlUnitErrorKinds(data));

  return (
    <ControlUnitCard
      cu={toControlUnitEntry(group.cu)}
      {...data}
      showRow={showRow}
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
