import { Divider, Stack, Typography } from "@mui/material";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { RecoveryTripwireView } from "./RecoveryTripwireView";

// Readonly: label + domain + tripwire in ordine, separati da un divider.
export interface RecoveryPolicyViewProps {
  readonly value: RecoveryPolicy;
}

export function RecoveryPolicyView({ value }: RecoveryPolicyViewProps) {
  return (
    <Stack sx={{ gap: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {value.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {value.domain}
        </Typography>
      </Stack>
      {value.tripwires.map((tripwire, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: RecoveryTripwire non ha id, sola lettura
        <Stack key={index} sx={{ gap: 1 }}>
          {index > 0 && <Divider />}
          <RecoveryTripwireView value={tripwire} />
        </Stack>
      ))}
    </Stack>
  );
}
