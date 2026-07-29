import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import type { PolicyStepSchema } from "@supervisor/core/retry/codec";
import { useState } from "react";
import { DurationForm } from "../duration/DurationForm";
import { NotifyRuleListForm } from "../notify/NotifyRuleListForm";
import { PipelineForm } from "../pipeline/PipelineForm";
import { PredicateExpressionForm } from "../predicates/PredicateExpressionForm";
import { RetryPolicyForm } from "../retry-policy/RetryPolicyForm";

// Form controllata per un RecoveryTripwire: compone i moduli gia' esistenti (duration,
// predicate expression, pipeline, retry policy, notify rule list) - stesso set di atomi
// riusato dal TripwireWizard. Expand/collapse locale segue il pattern gia' usato da
// EntryCard - stato di presentazione, non dominio.
export interface RecoveryTripwireFormProps {
  readonly value: RecoveryTripwire;
  readonly onChange: (next: RecoveryTripwire) => void;
  readonly retrySchema: readonly PolicyStepSchema[];
  readonly notifyTargetSchema: readonly NotifyTargetSchema[];
}

export function RecoveryTripwireForm({ value, onChange, retrySchema, notifyTargetSchema }: RecoveryTripwireFormProps) {
  const [expanded, setExpanded] = useState(true);
  const notify = value.notify ?? [];

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ gap: 1, alignItems: "center", cursor: "pointer" }}
        onClick={() => setExpanded((current) => !current)}
      >
        <IconButton size="small">
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          grace {value.grace}
        </Typography>
      </Stack>
      {expanded && (
        <Stack sx={{ gap: 1.5, pl: 4, mt: 1 }} onClick={(event) => event.stopPropagation()}>
          <DurationForm label="grace" value={value.grace} onChange={(grace) => onChange({ ...value, grace })} />
          <Stack sx={{ gap: 1 }}>
            <Typography variant="overline" color="textSecondary">
              Predicate
            </Typography>
            <PredicateExpressionForm
              value={value.predicate}
              onChange={(predicate) => onChange({ ...value, predicate })}
            />
          </Stack>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="overline" color="textSecondary">
              Pipeline
            </Typography>
            <PipelineForm value={value.pipeline} onChange={(pipeline) => onChange({ ...value, pipeline })} />
          </Stack>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="overline" color="textSecondary">
              Retry
            </Typography>
            <RetryPolicyForm
              value={value.retry}
              onChange={(retry) => onChange({ ...value, retry })}
              schema={retrySchema}
            />
          </Stack>
          <Stack sx={{ gap: 1 }}>
            <Typography variant="overline" color="textSecondary">
              Notify
            </Typography>
            <NotifyRuleListForm
              value={notify}
              onChange={(next) => onChange({ ...value, notify: next })}
              targetSchema={notifyTargetSchema}
            />
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
