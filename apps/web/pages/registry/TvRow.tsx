import { Bolt, Tv } from "@mui/icons-material";
import { Box } from "@mui/material";
import { EntryRow, entryRowSubgridSx } from "@supervisor/ui/EntryRow";
import * as O from "fp-ts/Option";
import { ActivityStat } from "../../components/ActivityStat";
import { ActivityStatus } from "../../components/ActivityStatus";
import { PredicateStat } from "../../components/PredicateStat";
import { RecoveryInterventionBadge, RecoveryResetButtons } from "../../components/RecoveryIntervention";
import { recoveryColorFor } from "./activityColors";
import { CameraRow } from "./CameraRow";
import { adbStatusFor } from "./hierarchy";
import type { RowActions, TvGroup } from "./types";

const RECOVERY_DOMAIN = "suitest-device";

export function TvRow({
  group,
  adbDevices,
  onToggle,
  onEdit,
  onDelete,
  onAssignCamera,
  onLinkCamera,
  onResetRecovery,
}: { group: TvGroup } & RowActions) {
  const { tv } = group;
  const inUseLabel = tv.inUseBy?.email ?? tv.inUseBy?.orgName ?? tv.inUseBy?.tokenName;

  return (
    <Box sx={{ ...entryRowSubgridSx, rowGap: 1 }}>
      <EntryRow
        icon={<Tv fontSize="small" />}
        label={tv.label}
        secondary={O.toUndefined(tv.ip)}
        checked={tv.controlled}
        checkedTitle="Controlled by supervisor"
        indicators={[
          <PredicateStat
            key="s"
            domain={RECOVERY_DOMAIN}
            entityId={tv.deviceId}
            name="suitest_device_status"
            label="Device status"
            colorFor={(value) =>
              value === undefined
                ? "disabled"
                : value === "READY"
                  ? "success"
                  : value === "OFFLINE"
                    ? "error"
                    : "warning"
            }
            detail={(value) => (value === undefined ? "unknown" : String(value))}
          />,
          <PredicateStat
            key="u"
            domain={RECOVERY_DOMAIN}
            entityId={tv.deviceId}
            name="suitest_device_in_use"
            label="In use"
            colorFor={(value) => (value === undefined ? "disabled" : value ? "warning" : "disabled")}
            detail={inUseLabel ?? "available"}
          />,
          <ActivityStat
            key="ar"
            source="recovery"
            entityId={tv.deviceId}
            label="Tripwire"
            colorFor={recoveryColorFor}
          />,
          <RecoveryInterventionBadge key="mi" domain={RECOVERY_DOMAIN} entityId={tv.deviceId} />,
        ]}
        context={
          <ActivityStatus
            source="recovery"
            entityId={tv.deviceId}
            label="Recovery status"
            icon={<Bolt fontSize="small" />}
            colorFor={recoveryColorFor}
          />
        }
        actions={[
          <RecoveryResetButtons key="mr" domain={RECOVERY_DOMAIN} entityId={tv.deviceId} onReset={onResetRecovery} />,
        ]}
        onToggle={() => onToggle("tv", tv.deviceId, tv.controlled)}
        onEdit={() => onEdit("tv", tv.deviceId, tv.label)}
        onDelete={() => onDelete("tv", tv.deviceId)}
      />
      {group.cameras.length > 0 && (
        <Box sx={{ ...entryRowSubgridSx, rowGap: 1, mt: 1, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {group.cameras.map((camera) => (
            <CameraRow
              key={camera.id}
              camera={camera}
              adbStatus={adbStatusFor(adbDevices, camera.adb?.target)}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAssign={() => onAssignCamera(camera)}
              onLink={() => onLinkCamera(camera)}
              onResetRecovery={onResetRecovery}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
