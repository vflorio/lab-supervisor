import { Stack, Typography } from "@mui/material";
import type { NotifyRule } from "@supervisor/core/notify/model";

// Readonly: target + channel + policy su una riga, messaggio sotto.
export interface NotifyRuleViewProps {
  readonly value: NotifyRule;
}

export function NotifyRuleView({ value }: NotifyRuleViewProps) {
  return (
    <Stack sx={{ gap: 0.5 }}>
      <Stack direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {value.type.type}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          #{value.channel} · {value.policy.join(", ")}
        </Typography>
      </Stack>
      <Typography variant="caption" color="textSecondary">
        {value.message.message}
      </Typography>
    </Stack>
  );
}
