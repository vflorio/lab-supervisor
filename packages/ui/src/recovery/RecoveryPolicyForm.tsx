import { Add, Delete, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { Box, IconButton, Stack, TextField } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { RecoveryPolicy, RecoveryTripwire } from "@supervisor/core/recovery/model";
import type { PolicyStepSchema } from "@supervisor/core/retry/codec";
import { RecoveryTripwireForm } from "./RecoveryTripwireForm";

// Form controllata per una RecoveryPolicy: label/domain + array di tripwire, stessa
// meccanica (add/remove/sposta) di RetryPolicyForm/WorkflowForm sui rispettivi array.
export interface RecoveryPolicyFormProps {
  readonly value: RecoveryPolicy;
  readonly onChange: (next: RecoveryPolicy) => void;
  readonly retrySchema: readonly PolicyStepSchema[];
  readonly notifyTargetSchema: readonly NotifyTargetSchema[];
}

const defaultTripwire = (): RecoveryTripwire => ({
  grace: "30s" as DurationString,
  predicate: { type: "ref", name: "" },
  pipeline: { type: "workflow", workflowName: "" },
  retry: [],
  notify: [],
});

export function RecoveryPolicyForm({ value, onChange, retrySchema, notifyTargetSchema }: RecoveryPolicyFormProps) {
  const updateTripwire = (index: number, next: RecoveryTripwire) =>
    onChange({ ...value, tripwires: value.tripwires.map((t, i) => (i === index ? next : t)) });
  const removeTripwire = (index: number) =>
    onChange({ ...value, tripwires: value.tripwires.filter((_, i) => i !== index) });
  const moveTripwire = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.tripwires.length) return;
    const next = [...value.tripwires];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange({ ...value, tripwires: next });
  };
  const addTripwire = () => onChange({ ...value, tripwires: [...value.tripwires, defaultTripwire()] });

  return (
    <Stack sx={{ gap: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1 }}>
        <TextField
          size="small"
          label="label"
          value={value.label}
          onChange={(event) => onChange({ ...value, label: event.target.value })}
          sx={{ maxWidth: 220 }}
        />
        <TextField
          size="small"
          label="domain"
          value={value.domain}
          onChange={(event) => onChange({ ...value, domain: event.target.value })}
          sx={{ maxWidth: 220 }}
        />
      </Stack>
      <Stack sx={{ gap: 1 }}>
        {value.tripwires.map((tripwire, index) => (
          <Stack
            // biome-ignore lint/suspicious/noArrayIndexKey: tripwire controllato via value/onChange, nessun id
            key={index}
            direction="row"
            sx={{
              gap: 1,
              alignItems: "flex-start",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              p: 1,
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <RecoveryTripwireForm
                value={tripwire}
                onChange={(next) => updateTripwire(index, next)}
                retrySchema={retrySchema}
                notifyTargetSchema={notifyTargetSchema}
              />
            </Box>
            <IconButton size="small" onClick={() => moveTripwire(index, -1)} disabled={index === 0}>
              <KeyboardArrowUp fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => moveTripwire(index, 1)}
              disabled={index === value.tripwires.length - 1}
            >
              <KeyboardArrowDown fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => removeTripwire(index)}>
              <Delete fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <IconButton size="small" onClick={addTripwire} title="Add tripwire" sx={{ alignSelf: "flex-start" }}>
        <Add fontSize="small" />
      </IconButton>
    </Stack>
  );
}
