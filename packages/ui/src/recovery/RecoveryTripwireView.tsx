import { Stack, Typography } from "@mui/material";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { DurationView } from "../duration/DurationView";
import { NotifyRuleView } from "../notify/NotifyRuleView";
import { PipelineView } from "../pipeline/PipelineView";
import { PredicateExpressionView } from "../predicates/PredicateExpressionView";
import { RetryPolicyView } from "../retry-policy/RetryPolicyView";

// Readonly: grace + predicate + pipeline + retry + notify, sempre espansa (il collapse
// e' un'affordance di editing, non di lettura).
export interface RecoveryTripwireViewProps {
  readonly value: RecoveryTripwire;
}

export function RecoveryTripwireView({ value }: RecoveryTripwireViewProps) {
  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
        <Typography variant="caption" color="textSecondary">
          grace
        </Typography>
        <DurationView value={value.grace} />
      </Stack>
      <Stack sx={{ gap: 0.5 }}>
        <Typography variant="overline" color="textSecondary">
          Predicate
        </Typography>
        <PredicateExpressionView value={value.predicate} />
      </Stack>
      <Stack sx={{ gap: 0.5 }}>
        <Typography variant="overline" color="textSecondary">
          Pipeline
        </Typography>
        <PipelineView value={value.pipeline} />
      </Stack>
      <Stack sx={{ gap: 0.5 }}>
        <Typography variant="overline" color="textSecondary">
          Retry
        </Typography>
        <RetryPolicyView value={value.retry} />
      </Stack>
      {value.notify && value.notify.length > 0 && (
        <Stack sx={{ gap: 0.5 }}>
          <Typography variant="overline" color="textSecondary">
            Notify
          </Typography>
          {value.notify.map((rule, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: NotifyRule non ha id, sola lettura
            <NotifyRuleView key={index} value={rule} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
