import { Add } from "@mui/icons-material";
import { IconButton, MenuItem, Select, type SelectChangeEvent, Stack } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import type { PolicyJson, PolicyStepArg, PolicyStepJson, PolicyStepSchema } from "@supervisor/core/retry/codec";
import { DurationForm } from "../duration/DurationForm";
import { DomainSortable } from "../misc/DomainSortable";
import { NumberField } from "../misc/number-field/NumberField";
import { moveAt, removeAt } from "../misc/sortable";

export interface RetryPolicyFormProps {
  readonly value: PolicyJson;
  readonly onChange: (next: PolicyJson) => void;
  readonly schema: readonly PolicyStepSchema[];
}

const defaultArg = (kind: PolicyStepSchema["args"][number]["kind"]): PolicyStepArg =>
  kind === "duration" ? ("0ms" as DurationString) : 0;

const stepFor = (schema: readonly PolicyStepSchema[], name: string): PolicyStepJson => {
  const found = schema.find((s) => s.name === name) ?? schema[0];
  if (!found) return [name] as unknown as PolicyStepJson;
  return [found.name, ...found.args.map((a) => defaultArg(a.kind))] as unknown as PolicyStepJson;
};

export function RetryPolicyForm({ value, onChange, schema }: RetryPolicyFormProps) {
  const updateStep = (index: number, step: PolicyStepJson) => onChange(value.map((s, i) => (i === index ? step : s)));

  const removeStep = (index: number) => onChange(removeAt<PolicyStepJson>(index)(value));

  const moveStep = (index: number, delta: number) => onChange(moveAt<PolicyStepJson>(index, delta)(value));

  const addStep = () => schema[0] && onChange([...value, stepFor(schema, schema[0].name)]);

  return (
    <Stack sx={{ gap: 1 }}>
      {value.map((step, index) => {
        const stepSchema = schema.find((s) => s.name === step[0]);

        const args = step.slice(1) as PolicyStepArg[];

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: step controllato via value/onChange, nessun id
          <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "center" }}>
            <Select
              size="small"
              value={step[0]}
              onChange={(event: SelectChangeEvent) => updateStep(index, stepFor(schema, event.target.value))}
              sx={{ minWidth: 160 }}
            >
              {schema.map((s) => (
                <MenuItem key={s.name} value={s.name}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
            {stepSchema?.args.map((argSchema, argIndex) => {
              const arg = args[argIndex];

              const setArg = (next: PolicyStepArg) => {
                const nextArgs = [...args];
                nextArgs[argIndex] = next;
                updateStep(index, [step[0], ...nextArgs] as unknown as PolicyStepJson);
              };

              return argSchema.kind === "duration" ? (
                <DurationForm
                  // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg nello schema dello step, stabile
                  key={argIndex}
                  label={argSchema.label}
                  value={typeof arg === "string" ? arg : "0ms"}
                  onChange={setArg}
                />
              ) : (
                <NumberField
                  // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg nello schema dello step, stabile
                  key={argIndex}
                  label={argSchema.label}
                  value={typeof arg === "number" ? arg : 0}
                  onChange={setArg}
                  width={100}
                />
              );
            })}
            <DomainSortable
              index={index}
              length={value.length}
              onMove={(delta) => moveStep(index, delta)}
              onRemove={() => removeStep(index)}
            />
          </Stack>
        );
      })}
      <IconButton size="small" onClick={addStep} title="Add step" sx={{ alignSelf: "flex-start" }}>
        <Add fontSize="small" />
      </IconButton>
    </Stack>
  );
}
