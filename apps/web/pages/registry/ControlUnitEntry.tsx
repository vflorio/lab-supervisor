import { Dns } from "@mui/icons-material";
import { Button } from "@mui/material";
import { ControlToggleButton, EntryCard, StatusPill } from "@supervisor/ui/registry/index";
import { useActivityStat } from "../../components/ActivityStat";
import { usePredicateStat } from "../../components/PredicateStat";
import { RecoveryInterventionBadge, RecoveryResetButtons } from "../../components/RecoveryIntervention";
import { recoveryColorFor } from "./activityColors";
import { TvEntry } from "./TvEntry";
import type { CuGroup, RowActions } from "./types";

const RECOVERY_DOMAIN = "suitest-control-unit";

export function ControlUnitEntry({
  group,
  adbDevices,
  onToggle,
  onEdit,
  onDelete,
  onAssignCamera,
  onLinkCamera,
  onResetRecovery,
  workflows,
  onRunWorkflow,
}: { group: CuGroup } & RowActions) {
  const online = usePredicateStat({
    domain: RECOVERY_DOMAIN,
    entityId: group.cu.id,
    name: "suitest_control_unit_online",
    colorFor: (value) => (value === undefined ? "disabled" : value ? "success" : "error"),
    detail: (value) => (value === undefined ? "unknown" : value ? "online" : "offline"),
  });
  const recovery = useActivityStat({ source: "recovery", entityId: group.cu.id, colorFor: recoveryColorFor });

  return (
    <EntryCard
      icon={<Dns fontSize="small" />}
      title={group.cu.label}
      subtitle={group.cu.id}
      status={<StatusPill label={online.detailText.toUpperCase()} tone={online.tone} />}
      summary={`${online.detailText} · Recovery ${recovery.detailText}`}
      details={[
        { label: "Control unit status", value: online.detailText, tone: online.tone },
        { label: "Recovery", value: recovery.detailText, tone: recovery.tone },
      ]}
      expandedActions={
        <>
          <RecoveryInterventionBadge domain={RECOVERY_DOMAIN} entityId={group.cu.id} />
          <RecoveryResetButtons domain={RECOVERY_DOMAIN} entityId={group.cu.id} onReset={onResetRecovery} />
          <ControlToggleButton
            controlled={group.cu.controlled}
            onToggle={() => onToggle("candybox", group.cu.id, group.cu.controlled)}
          />
        </>
      }
      actions={
        <>
          <Button size="small" onClick={() => onEdit("candybox", group.cu.id, group.cu.label)}>
            Edit
          </Button>
          <Button size="small" color="error" onClick={() => onDelete("candybox", group.cu.id)}>
            Delete
          </Button>
        </>
      }
    >
      {group.tvs.map((tvGroup) => (
        <TvEntry
          key={tvGroup.tv.deviceId}
          group={tvGroup}
          adbDevices={adbDevices}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onAssignCamera={onAssignCamera}
          onLinkCamera={onLinkCamera}
          onResetRecovery={onResetRecovery}
          workflows={workflows}
          onRunWorkflow={onRunWorkflow}
        />
      ))}
    </EntryCard>
  );
}
