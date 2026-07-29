import { Add } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { DeviceCardList } from "../registry/DeviceCardList";

// Lista delle recovery policy configurate + azione "new policy". Compone DeviceCardList,
// stessa struttura di WorkflowList.
export interface RecoveryPolicyListProps {
  readonly policies: readonly RecoveryPolicy[];
  readonly selectedLabel?: string;
  readonly onSelect: (label: string) => void;
  readonly onCreate: () => void;
}

export function RecoveryPolicyList({ policies, selectedLabel, onSelect, onCreate }: RecoveryPolicyListProps) {
  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="overline" color="text.secondary">
          Recovery policies
        </Typography>
        <IconButton size="small" onClick={onCreate} title="New recovery policy">
          <Add fontSize="small" />
        </IconButton>
      </Stack>
      <DeviceCardList items={policies} getKey={(policy) => policy.label}>
        {(policy) => (
          <Box
            onClick={() => onSelect(policy.label)}
            sx={{
              cursor: "pointer",
              p: 1,
              borderRadius: 2,
              border: "1px solid",
              borderColor: policy.label === selectedLabel ? "primary.main" : "divider",
              bgcolor: policy.label === selectedLabel ? "action.selected" : "transparent",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {policy.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {policy.domain} · {policy.tripwires.length} tripwire{policy.tripwires.length === 1 ? "" : "s"}
            </Typography>
          </Box>
        )}
      </DeviceCardList>
    </Stack>
  );
}
