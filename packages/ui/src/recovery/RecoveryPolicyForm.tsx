import { Add } from "@mui/icons-material";
import { Box, IconButton, MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import * as Facts from "@supervisor/core/fact/condition";
import { TRACKED_DOMAINS } from "@supervisor/core/fact/model";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { RecoveryPolicy, RecoveryTripwire } from "@supervisor/core/recovery/model";
import type { PolicyStepSchema } from "@supervisor/core/retry/codec";
import type { FactOption } from "../fact/FactRefPicker";
import { DomainSortable } from "../misc/DomainSortable";
import { moveAt, removeAt } from "../misc/sortable";
import { RecoveryTripwireForm } from "./RecoveryTripwireForm";

export interface RecoveryPolicyFormProps {
  readonly value: RecoveryPolicy;
  readonly onChange: (next: RecoveryPolicy) => void;
  readonly retrySchema: readonly PolicyStepSchema[];
  readonly notifyTargetSchema: readonly NotifyTargetSchema[];
  readonly workflowNames: readonly string[];
  readonly factOptions: readonly FactOption[];
}

const defaultTripwire = (): RecoveryTripwire => ({
  grace: "30s" as DurationString,
  predicate: Facts.ref(""),
  pipeline: { type: "workflow", workflowName: "" },
  retry: [],
  notify: [],
});

export function RecoveryPolicyForm({
  value,
  onChange,
  retrySchema,
  notifyTargetSchema,
  workflowNames,
  factOptions,
}: RecoveryPolicyFormProps) {
  const updateTripwire = (index: number, next: RecoveryTripwire) =>
    onChange({ ...value, tripwires: value.tripwires.map((t, i) => (i === index ? next : t)) });

  const removeTripwire = (index: number) =>
    onChange({ ...value, tripwires: removeAt<RecoveryTripwire>(index)(value.tripwires) });

  const moveTripwire = (index: number, delta: number) =>
    onChange({ ...value, tripwires: moveAt<RecoveryTripwire>(index, delta)(value.tripwires) });

  const addTripwire = () => onChange({ ...value, tripwires: [...value.tripwires, defaultTripwire()] });

  return (
    <Stack sx={{ gap: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1 }}>
        <TextField
          label="label"
          size="small"
          fullWidth
          value={value.label}
          onChange={(event) => onChange({ ...value, label: event.target.value })}
        />
        <Select
          size="small"
          fullWidth
          value={value.domain}
          onChange={(event: SelectChangeEvent) => onChange({ ...value, domain: event.target.value })}
        >
          {TRACKED_DOMAINS.map((domain) => (
            <MenuItem key={domain} value={domain}>
              {domain}
            </MenuItem>
          ))}
        </Select>
      </Stack>
      <Stack sx={{ gap: 1 }}>
        {value.tripwires.map((tripwire, index) => (
          <Stack
            // biome-ignore lint/suspicious/noArrayIndexKey: tripwire controlled via value/onChange, no id
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
                workflowNames={workflowNames}
                factOptions={factOptions}
              />
            </Box>
            <DomainSortable
              index={index}
              length={value.tripwires.length}
              onMove={(delta) => moveTripwire(index, delta)}
              onRemove={() => removeTripwire(index)}
            />
          </Stack>
        ))}
      </Stack>
      <IconButton
        size="small"
        onClick={addTripwire}
        title="Add tripwire (manual setup) "
        sx={{ alignSelf: "flex-start" }}
      >
        <Add fontSize="small" />
      </IconButton>
    </Stack>
  );
}
