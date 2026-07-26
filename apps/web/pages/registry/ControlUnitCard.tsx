import { Bolt, Dns } from "@mui/icons-material";
import { Box, Paper } from "@mui/material";
import { EntryRow, entryRowGridSx, entryRowSubgridSx } from "@supervisor/ui/EntryRow";
import { ActivityStat } from "../../components/ActivityStat";
import { ActivityStatus } from "../../components/ActivityStatus";
import { PredicateStat } from "../../components/PredicateStat";
import { recoveryColorFor, workflowColorFor } from "./activityColors";
import { TvRow } from "./TvRow";
import type { CuGroup, RowActions } from "./types";

export function ControlUnitCard({
  group,
  adbDevices,
  onToggle,
  onEdit,
  onDelete,
  onAssignCamera,
  onLinkCamera,
}: { group: CuGroup } & RowActions) {
  return (
    <Paper variant="outlined" sx={{ ...entryRowGridSx, p: 2, rowGap: 1 }}>
      <EntryRow
        icon={<Dns fontSize="small" />}
        label={group.cu.label}
        secondary={group.cu.id}
        checked={group.cu.controlled}
        checkedTitle="Controlled by supervisor"
        indicators={[
          <PredicateStat
            key="p"
            domain="suitest-control-unit"
            entityId={group.cu.id}
            name="suitest_control_unit_online"
            label="Control unit status"
            colorFor={(value) => (value === undefined ? "disabled" : value ? "success" : "error")}
            detail={(value) => (value === undefined ? "unknown" : value ? "online" : "offline")}
          />,
          <ActivityStat
            key="ar"
            source="recovery"
            entityId={group.cu.id}
            label="Tripwire"
            colorFor={recoveryColorFor}
          />,
        ]}
        context={
          <ActivityStatus
            source="workflow"
            entityId={group.cu.id}
            label="Recovery workflow"
            icon={<Bolt fontSize="small" />}
            colorFor={workflowColorFor}
          />
        }
        onToggle={() => onToggle("candybox", group.cu.id, group.cu.controlled)}
        onEdit={() => onEdit("candybox", group.cu.id, group.cu.label)}
        onDelete={() => onDelete("candybox", group.cu.id)}
      />
      {group.tvs.length > 0 && (
        <Box sx={{ ...entryRowSubgridSx, rowGap: 1, mt: 1.5, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {group.tvs.map((tvGroup) => (
            <TvRow
              key={tvGroup.tv.deviceId}
              group={tvGroup}
              adbDevices={adbDevices}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAssignCamera={onAssignCamera}
              onLinkCamera={onLinkCamera}
            />
          ))}
        </Box>
      )}
    </Paper>
  );
}
