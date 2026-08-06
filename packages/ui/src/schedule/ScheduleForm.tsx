import { Add } from "@mui/icons-material";
import { Chip, IconButton, MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { DayOfWeek, DurationString, TimeString } from "@supervisor/core/date-time";
import type {
  ScheduleJson,
  ScheduleOp,
  ScheduleStepArg,
  ScheduleStepJson,
  ScheduleStepSchema,
  ScheduleVerbJson,
} from "@supervisor/core/schedule/codec";
import { match } from "ts-pattern";
import { DurationForm } from "../duration/DurationForm";
import { DomainSortable } from "../misc/DomainSortable";
import { reorderableList } from "../misc/sortable";

const DAYS: readonly DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Gio",
  friday: "Ven",
  saturday: "Sab",
  sunday: "Dom",
};
const OPS: readonly ScheduleOp[] = ["union", "intersection", "subtract"];
const OP_LABELS: Record<ScheduleOp, string> = {
  union: "Unione",
  intersection: "Intersezione",
  subtract: "Sottrazione",
};

export interface ScheduleFormProps {
  readonly value: ScheduleJson;
  readonly onChange: (next: ScheduleJson) => void;
  readonly schema: readonly ScheduleStepSchema[];
}

const defaultArg = (kind: ScheduleStepSchema["args"][number]["kind"]): ScheduleStepArg =>
  match(kind)
    .with("day", () => "monday" as DayOfWeek)
    .with("time", () => "09:00" as TimeString)
    .with("duration", () => "5m" as DurationString)
    .exhaustive();

const verbFor = (schema: readonly ScheduleStepSchema[], name: string): ScheduleVerbJson => {
  const found = schema.find((s) => s.name === name) ?? schema[0];
  if (!found) return [name] as unknown as ScheduleVerbJson;
  return [found.name, ...found.args.map((a) => defaultArg(a.kind))] as unknown as ScheduleVerbJson;
};

export function ScheduleForm({ value, onChange, schema }: ScheduleFormProps) {
  const steps = reorderableList<ScheduleStepJson>(value, onChange);

  const addStep = () => schema[0] && steps.add(["union", verbFor(schema, schema[0].name)]);

  return (
    <Stack sx={{ gap: 1 }}>
      {value.map(([op, verb], index) => {
        const verbSchema = schema.find((s) => s.name === verb[0]);

        const args = verb.slice(1) as ScheduleStepArg[];

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: step controllato via value/onChange, nessun id
          <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            {index === 0 ? (
              <Chip label="Base" size="small" variant="outlined" />
            ) : (
              <Select
                size="small"
                value={op}
                onChange={(event: SelectChangeEvent) => steps.update(index, [event.target.value as ScheduleOp, verb])}
                sx={{ minWidth: 130 }}
              >
                {OPS.map((o) => (
                  <MenuItem key={o} value={o}>
                    {OP_LABELS[o]}
                  </MenuItem>
                ))}
              </Select>
            )}
            <Select
              size="small"
              value={verb[0]}
              onChange={(event: SelectChangeEvent) => steps.update(index, [op, verbFor(schema, event.target.value)])}
              sx={{ minWidth: 140 }}
            >
              {schema.map((s) => (
                <MenuItem key={s.name} value={s.name} title={s.description}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
            {verbSchema?.args.map((argSchema, argIndex) => {
              const arg = args[argIndex];
              const setArg = (next: ScheduleStepArg) => {
                const nextArgs = [...args];
                nextArgs[argIndex] = next;
                steps.update(index, [op, [verb[0], ...nextArgs] as unknown as ScheduleVerbJson]);
              };

              if (argSchema.kind === "day") {
                return (
                  <Select
                    // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg nello schema dello step, stabile
                    key={argIndex}
                    size="small"
                    value={typeof arg === "string" && DAYS.includes(arg as DayOfWeek) ? arg : DAYS[0]}
                    onChange={(event: SelectChangeEvent) => setArg(event.target.value as DayOfWeek)}
                    sx={{ minWidth: 100 }}
                  >
                    {DAYS.map((d) => (
                      <MenuItem key={d} value={d}>
                        {DAY_SHORT[d]}
                      </MenuItem>
                    ))}
                  </Select>
                );
              }

              if (argSchema.kind === "duration") {
                return (
                  <DurationForm
                    // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg nello schema dello step, stabile
                    key={argIndex}
                    label={argSchema.label}
                    value={typeof arg === "string" ? (arg as DurationString) : ("5m" as DurationString)}
                    onChange={setArg}
                  />
                );
              }

              return (
                <TextField
                  // biome-ignore lint/suspicious/noArrayIndexKey: posizione dell'arg nello schema dello step, stabile
                  key={argIndex}
                  label={argSchema.label}
                  size="small"
                  type="time"
                  fullWidth
                  value={typeof arg === "string" ? arg : "09:00"}
                  onChange={(event) => setArg(event.target.value as TimeString)}
                />
              );
            })}

            <DomainSortable
              index={index}
              length={value.length}
              onMove={(delta) => steps.move(index, delta)}
              onRemove={() => steps.remove(index)}
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
