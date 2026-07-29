import { Add, Delete, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { IconButton, Stack } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { NotifyRule } from "@supervisor/core/notify/model";
import { NotifyRuleForm } from "./NotifyRuleForm";

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

// Form controllata per un array di NotifyRule: add/remove/sposta, stessa meccanica di
// RetryPolicyForm/WorkflowForm sui rispettivi array. Estratto da RecoveryTripwireForm cosi'
// il TripwireWizard puo' riusare lo stesso editor per lo step Notify.
export interface NotifyRuleListFormProps {
  readonly value: readonly NotifyRule[];
  readonly onChange: (next: readonly NotifyRule[]) => void;
  readonly targetSchema: readonly NotifyTargetSchema[];
}

export function NotifyRuleListForm({ value, onChange, targetSchema }: NotifyRuleListFormProps) {
  const updateRule = (index: number, next: NotifyRule) => onChange(value.map((rule, i) => (i === index ? next : rule)));
  const removeRule = (index: number) => onChange(value.filter((_, i) => i !== index));
  const moveRule = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const addRule = () => onChange([...value, defaultNotifyRule(targetSchema)]);

  return (
    <Stack sx={{ gap: 1 }}>
      {value.map((rule, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rule controllata via value/onChange, nessun id
        <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "flex-start" }}>
          <NotifyRuleForm value={rule} onChange={(next) => updateRule(index, next)} targetSchema={targetSchema} />
          <IconButton size="small" onClick={() => moveRule(index, -1)} disabled={index === 0}>
            <KeyboardArrowUp fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => moveRule(index, 1)} disabled={index === value.length - 1}>
            <KeyboardArrowDown fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => removeRule(index)}>
            <Delete fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <IconButton size="small" onClick={addRule} title="Add notify rule" sx={{ alignSelf: "flex-start" }}>
        <Add fontSize="small" />
      </IconButton>
    </Stack>
  );
}
