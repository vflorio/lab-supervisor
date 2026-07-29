import { Tv } from "@mui/icons-material";
import { Button } from "@mui/material";
import { ControlToggleButton, EntryCard, StatusPill } from "@supervisor/ui/registry/index";
import * as O from "fp-ts/Option";
import { useActivityStat } from "../../components/ActivityStat";
import { usePredicateStat } from "../../components/PredicateStat";
import { RecoveryInterventionBadge, RecoveryResetButtons } from "../../components/RecoveryIntervention";
import { recoveryColorFor } from "./activityColors";
import { CameraEntry } from "./CameraEntry";
import { adbStatusFor } from "./hierarchy";
import type { RowActions, TvGroup } from "./types";

const RECOVERY_DOMAIN = "suitest-device";

export function TvEntry({
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
}: { group: TvGroup } & RowActions) {
  const { tv } = group;
  const inUseLabel = tv.inUseBy?.email ?? tv.inUseBy?.orgName ?? tv.inUseBy?.tokenName;

  const deviceStatus = usePredicateStat({
    domain: RECOVERY_DOMAIN,
    entityId: tv.deviceId,
    name: "suitest_device_status",
    colorFor: (value) =>
      value === undefined ? "disabled" : value === "READY" ? "success" : value === "OFFLINE" ? "error" : "warning",
    detail: (value) => (value === undefined ? "unknown" : String(value)),
  });
  const inUse = usePredicateStat({
    domain: RECOVERY_DOMAIN,
    entityId: tv.deviceId,
    name: "suitest_device_in_use",
    colorFor: (value) => (value === undefined ? "disabled" : value ? "warning" : "disabled"),
    detail: inUseLabel ?? "available",
  });
  const recovery = useActivityStat({ source: "recovery", entityId: tv.deviceId, colorFor: recoveryColorFor });

  return (
    <EntryCard
      icon={<Tv fontSize="small" />}
      title={tv.label}
      subtitle={O.toUndefined(tv.ip)}
      status={<StatusPill label={deviceStatus.detailText.toUpperCase()} tone={deviceStatus.tone} />}
      summary={`${deviceStatus.detailText} · Recovery ${recovery.detailText}`}
      details={[
        { label: "Device status", value: deviceStatus.detailText, tone: deviceStatus.tone },
        { label: "In use", value: inUse.detailText, tone: inUse.tone },
        { label: "Recovery", value: recovery.detailText, tone: recovery.tone },
      ]}
      expandedActions={
        <>
          <RecoveryInterventionBadge domain={RECOVERY_DOMAIN} entityId={tv.deviceId} />
          <RecoveryResetButtons domain={RECOVERY_DOMAIN} entityId={tv.deviceId} onReset={onResetRecovery} />
          <ControlToggleButton controlled={tv.controlled} onToggle={() => onToggle("tv", tv.deviceId, tv.controlled)} />
        </>
      }
      actions={
        <>
          <Button size="small" onClick={() => onEdit("tv", tv.deviceId, tv.label)}>
            Edit
          </Button>
          <Button size="small" color="error" onClick={() => onDelete("tv", tv.deviceId)}>
            Delete
          </Button>
        </>
      }
    >
      {group.cameras.map((camera) => (
        <CameraEntry
          key={camera.id}
          camera={camera}
          adbStatus={adbStatusFor(adbDevices, camera.adb?.target)}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onAssign={() => onAssignCamera(camera)}
          onLink={() => onLinkCamera(camera)}
          onResetRecovery={onResetRecovery}
          workflows={workflows}
          onRunWorkflow={onRunWorkflow}
        />
      ))}
    </EntryCard>
  );
}
