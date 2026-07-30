import { Checkbox, FormControlLabel, MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { NotifyLifecycle, NotifyRule } from "@supervisor/core/notify/model";
import { FieldLabel } from "../misc/FieldLabel";

const LIFECYCLES: readonly NotifyLifecycle[] = ["immediate", "exhausted"];

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
    <Stack sx={{ gap: 2, flexGrow: 1 }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap", flexGrow: 1 }}>
        <TextField
          select
          label="type"
          size="small"
          value={value.type.type}
          onChange={(event) => onChange({ ...value, type: targetFor(targetSchema, event.target.value) })}
          sx={{ minWidth: 110 }}
        >
          {targetSchema.map((s) => (
            <MenuItem key={s.type} value={s.type}>
              {s.type}
            </MenuItem>
          ))}
        </TextField>
        {fields.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            sx={{ minWidth: 160 }}
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
        ))}
        <TextField
          label="channel"
          size="small"
          sx={{ flexGrow: 1, minWidth: 160 }}
          value={value.channel}
          onChange={(event) => onChange({ ...value, channel: event.target.value })}
        />
      </Stack>
      <TextField
        label="message"
        multiline
        minRows={3}
        fullWidth
        size="small"
        value={value.message.message}
        onChange={(event) => onChange({ ...value, message: { type: "template", message: event.target.value } })}
      />
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
