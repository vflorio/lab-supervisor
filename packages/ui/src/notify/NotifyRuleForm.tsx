import { Checkbox, FormControlLabel, MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { NotifyLifecycle, NotifyRule } from "@supervisor/core/notify/model";
import { FieldLabel } from "../misc/FieldLabel";

const LIFECYCLES: readonly NotifyLifecycle[] = ["immediate", "exhausted"];

// Form controllata per una NotifyRule. Il target (oggi solo "slack") e' pilotato da
// NOTIFY_TARGET_SCHEMA - vedi @supervisor/core/notify/codec - cosi' un futuro "webhook"
// non richiede modifiche qui. Lifecycle e' un'unione chiusa di 2 valori, hardcoded.
export interface NotifyRuleFormProps {
  readonly value: NotifyRule;
  readonly onChange: (next: NotifyRule) => void;
  readonly targetSchema: readonly NotifyTargetSchema[];
}

const targetFor = (schema: readonly NotifyTargetSchema[], type: string): NotifyRule["type"] => {
  const found = schema.find((s) => s.type === type) ?? schema[0];
  const record: Record<string, unknown> = { type: found?.type ?? type };
  for (const field of found?.fields ?? []) record[field.key] = "";
  return record as unknown as NotifyRule["type"];
};

export function NotifyRuleForm({ value, onChange, targetSchema }: NotifyRuleFormProps) {
  const fields = targetSchema.find((s) => s.type === value.type.type)?.fields ?? [];
  const targetRecord = value.type as unknown as Record<string, unknown>;

  const togglePolicy = (lifecycle: NotifyLifecycle) =>
    onChange({
      ...value,
      policy: value.policy.includes(lifecycle)
        ? value.policy.filter((p) => p !== lifecycle)
        : [...value.policy, lifecycle],
    });

  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Select
          size="small"
          value={value.type.type}
          onChange={(event: SelectChangeEvent) =>
            onChange({ ...value, type: targetFor(targetSchema, event.target.value) })
          }
          sx={{ minWidth: 110 }}
        >
          {targetSchema.map((s) => (
            <MenuItem key={s.type} value={s.type}>
              {s.type}
            </MenuItem>
          ))}
        </Select>
        {fields.map((field) => (
          <FieldLabel key={field.key} label={field.label} width={160}>
            <TextField
              size="small"
              fullWidth
              value={typeof targetRecord[field.key] === "string" ? (targetRecord[field.key] as string) : ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  type: { ...targetRecord, [field.key]: event.target.value } as unknown as NotifyRule["type"],
                })
              }
            />
          </FieldLabel>
        ))}
        <FieldLabel label="channel" width={160}>
          <TextField
            size="small"
            fullWidth
            value={value.channel}
            onChange={(event) => onChange({ ...value, channel: event.target.value })}
          />
        </FieldLabel>
      </Stack>
      <FieldLabel label="message" width="100%">
        <TextField
          size="small"
          fullWidth
          value={value.message.message}
          onChange={(event) => onChange({ ...value, message: { type: "template", message: event.target.value } })}
        />
      </FieldLabel>
      <Stack direction="row" sx={{ gap: 1 }}>
        {LIFECYCLES.map((lifecycle) => (
          <FormControlLabel
            key={lifecycle}
            control={
              <Checkbox
                size="small"
                checked={value.policy.includes(lifecycle)}
                onChange={() => togglePolicy(lifecycle)}
              />
            }
            label={lifecycle}
          />
        ))}
      </Stack>
    </Stack>
  );
}
