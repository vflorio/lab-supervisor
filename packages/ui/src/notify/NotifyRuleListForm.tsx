import { Add } from "@mui/icons-material";
import { IconButton, Stack } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { NotifyRule } from "@supervisor/core/notify/model";
import { DomainSortable } from "../misc/DomainSortable";
import { moveAt, removeAt } from "../misc/sortable";
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

export interface NotifyRuleListFormProps {
  readonly value: readonly NotifyRule[];
  readonly onChange: (next: readonly NotifyRule[]) => void;
  readonly targetSchema: readonly NotifyTargetSchema[];
}

export function NotifyRuleListForm({ value, onChange, targetSchema }: NotifyRuleListFormProps) {
  const updateRule = (index: number, next: NotifyRule) => onChange(value.map((rule, i) => (i === index ? next : rule)));
  const removeRule = (index: number) => onChange(removeAt<NotifyRule>(index)(value));
  const moveRule = (index: number, delta: number) => onChange(moveAt<NotifyRule>(index, delta)(value));
  const addRule = () => onChange([...value, defaultNotifyRule(targetSchema)]);

  return (
    <Stack sx={{ gap: 1 }}>
      {value.map((rule, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rule controllata via value/onChange, nessun id
        <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "flex-start" }}>
          <NotifyRuleForm value={rule} onChange={(next) => updateRule(index, next)} targetSchema={targetSchema} />
          <DomainSortable
            index={index}
            length={value.length}
            onMove={(delta) => moveRule(index, delta)}
            onRemove={() => removeRule(index)}
          />
        </Stack>
      ))}
      <IconButton size="small" onClick={addRule} title="Add notify rule" sx={{ alignSelf: "flex-start" }}>
        <Add fontSize="small" />
      </IconButton>
    </Stack>
  );
}
