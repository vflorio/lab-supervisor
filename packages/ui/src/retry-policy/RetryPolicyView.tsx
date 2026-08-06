import { ArrowForward } from "@mui/icons-material";
import { Stack, Typography } from "@mui/material";
import type { PolicyJson } from "@supervisor/core/retry/codec";
import { DurationView } from "../duration/DurationView";

// Readonly: catena di step "name arg arg ..." separati da freccia.
export interface RetryPolicyViewProps {
  readonly value: PolicyJson;
}

export function RetryPolicyView({ value }: RetryPolicyViewProps) {
  return (
    <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
      {value.map((step, index) => {
        const [name, ...args] = step;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: PolicyJson non ha id, sola lettura
          <Stack key={index} direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
            {index > 0 && <ArrowForward fontSize="small" sx={{ color: "text.secondary", mt: 0.25 }} />}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {name}
            </Typography>
            {args.map((arg, argIndex) =>
              typeof arg === "string" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg, sola lettura
                <DurationView key={argIndex} value={arg} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg, sola lettura
                <Typography key={argIndex} variant="caption" color="textSecondary">
                  {arg}
                </Typography>
              ),
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
