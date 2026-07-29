import { Add, Delete, ExpandLess, ExpandMore, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { NotifyRule } from "@supervisor/core/notify/model";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import type { PolicyStepSchema } from "@supervisor/core/retry/codec";
import { useState } from "react";
import { DurationForm } from "../duration/DurationForm";
import { NotifyRuleForm } from "../notify/NotifyRuleForm";
import { PipelineForm } from "../pipeline/PipelineForm";
import { PredicateExpressionForm } from "../predicates/PredicateExpressionForm";
import { RetryPolicyForm } from "../retry-policy/RetryPolicyForm";

// Form controllata per un RecoveryTripwire: compone i moduli gia' esistenti (duration,
// predicate expression, pipeline, retry policy) + un editor per l'array di NotifyRule,
// stessa meccanica add/remove/sposta di RetryPolicyForm/WorkflowForm. Expand/collapse
// locale segue il pattern gia' usato da EntryCard - stato di presentazione, non dominio.
export interface RecoveryTripwireFormProps {
  readonly value: RecoveryTripwire;
  readonly onChange: (next: RecoveryTripwire) => void;
  readonly retrySchema: readonly PolicyStepSchema[];
  readonly notifyTargetSchema: readonly NotifyTargetSchema[];
}

const defaultNotifyRule = (schema: readonly NotifyTargetSchema[]): NotifyRule => {
  const found = schema[0];
  const record: Record<string, unknown> = { type: found?.type ?? "slack" };
  for (const field of found?.fields ?? []) record[field.key] = "";

  return {
    type: record as unknown as NotifyRule["type"],
    channel: "",
    message: { type: "template", message: "" },
    policy: ["immediate"],
  };
};

export function RecoveryTripwireForm({ value, onChange, retrySchema, notifyTargetSchema }: RecoveryTripwireFormProps) {
  const [expanded, setExpanded] = useState(true);
  const notify = value.notify ?? [];

  const updateNotify = (index: number, next: NotifyRule) =>
    onChange({ ...value, notify: notify.map((rule, i) => (i === index ? next : rule)) });
  const removeNotify = (index: number) => onChange({ ...value, notify: notify.filter((_, i) => i !== index) });
  const moveNotify = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= notify.length) return;
    const next = [...notify];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...value, notify: next });
  };
  const addNotify = () => onChange({ ...value, notify: [...notify, defaultNotifyRule(notifyTargetSchema)] });

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
          <Stack sx={{ gap: 0.5 }}>
            <Typography variant="overline" color="text.secondary">
              Predicate
            </Typography>
            <PredicateExpressionForm
              value={value.predicate}
              onChange={(predicate) => onChange({ ...value, predicate })}
            />
          </Stack>
          <Stack sx={{ gap: 0.5 }}>
            <Typography variant="overline" color="text.secondary">
              Pipeline
            </Typography>
            <PipelineForm value={value.pipeline} onChange={(pipeline) => onChange({ ...value, pipeline })} />
          </Stack>
          <Stack sx={{ gap: 0.5 }}>
            <Typography variant="overline" color="text.secondary">
              Retry
            </Typography>
            <RetryPolicyForm
              value={value.retry}
              onChange={(retry) => onChange({ ...value, retry })}
              schema={retrySchema}
            />
          </Stack>
          <Stack sx={{ gap: 0.5 }}>
            <Typography variant="overline" color="text.secondary">
              Notify
            </Typography>
            {notify.map((rule, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rule controllata via value/onChange, nessun id
              <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "flex-start" }}>
                <NotifyRuleForm
                  value={rule}
                  onChange={(next) => updateNotify(index, next)}
                  targetSchema={notifyTargetSchema}
                />
                <IconButton size="small" onClick={() => moveNotify(index, -1)} disabled={index === 0}>
                  <KeyboardArrowUp fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => moveNotify(index, 1)} disabled={index === notify.length - 1}>
                  <KeyboardArrowDown fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => removeNotify(index)}>
                  <Delete fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <IconButton size="small" onClick={addNotify} title="Add notify rule" sx={{ alignSelf: "flex-start" }}>
              <Add fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
