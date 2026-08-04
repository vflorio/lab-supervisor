import { MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { ConditionLeaf, ProbeLeaf } from "@supervisor/core/workflow/condition";
import { PROBE_SCHEMA, type ProbeName } from "@supervisor/core/workflow/probe";
import { FactLeafForm } from "../fact/FactLeafForm";
import type { FactOption } from "../fact/FactRefPicker";
import { FieldLabel } from "../misc/FieldLabel";

// Una foglia di Condition è un fatto tracciato o un probe sul device. Il selettore in testa
// sceglie quale delle due: sotto, un fatto riusa FactLeafForm (stesso editor dei tripwire),
// un probe mostra il proprio nome e i propri argomenti presi da PROBE_SCHEMA.

export interface ConditionLeafFormProps {
  readonly value: ConditionLeaf;
  readonly onChange: (next: ConditionLeaf) => void;
  readonly factOptions: readonly FactOption[];
}

const DEFAULT_PROBE: ProbeLeaf = { type: "probe", name: "screenOn", args: [] };

const defaultArgs = (name: ProbeName): string[] =>
  (PROBE_SCHEMA.find((schema) => schema.name === name)?.args ?? []).map((arg) => arg.options?.[0] ?? "");

function ProbeForm({ value, onChange }: { value: ProbeLeaf; onChange: (next: ConditionLeaf) => void }) {
  const schema = PROBE_SCHEMA.find((entry) => entry.name === value.name);

  const setArg = (index: number, next: string) =>
    onChange({ ...value, args: value.args.map((arg, i) => (i === index ? next : arg)) });

  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Select
        size="small"
        value={value.name}
        onChange={(event: SelectChangeEvent) => {
          const name = event.target.value as ProbeName;
          onChange({ type: "probe", name, args: defaultArgs(name) });
        }}
        sx={{ minWidth: 190 }}
      >
        {PROBE_SCHEMA.map((entry) => (
          <MenuItem key={entry.name} value={entry.name} title={entry.description}>
            {entry.name}
          </MenuItem>
        ))}
      </Select>
      {schema?.args.map((arg, index) =>
        arg.options ? (
          <Select
            key={arg.label}
            size="small"
            value={value.args[index] ?? arg.options[0]}
            onChange={(event: SelectChangeEvent) => setArg(index, event.target.value)}
            sx={{ minWidth: 140 }}
          >
            {arg.options.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        ) : (
          <FieldLabel key={arg.label} label={arg.label} width={280}>
            <TextField
              size="small"
              fullWidth
              value={value.args[index] ?? ""}
              onChange={(event) => setArg(index, event.target.value)}
            />
          </FieldLabel>
        ),
      )}
    </Stack>
  );
}

export function ConditionLeafForm({ value, onChange, factOptions }: ConditionLeafFormProps) {
  const source = value.type === "probe" ? "probe" : "fact";

  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Select
        size="small"
        value={source}
        onChange={(event: SelectChangeEvent) =>
          onChange(event.target.value === "probe" ? DEFAULT_PROBE : { type: "ref", name: "" })
        }
        sx={{ minWidth: 90 }}
      >
        <MenuItem value="fact" title="Fatto osservato dai tracker (gratis, aggiornato al polling)">
          fact
        </MenuItem>
        <MenuItem value="probe" title="Lettura dal vivo del device (una chiamata ADB)">
          probe
        </MenuItem>
      </Select>
      {value.type === "probe" ? (
        <ProbeForm value={value} onChange={onChange} />
      ) : (
        <FactLeafForm value={value} onChange={onChange} factOptions={factOptions} />
      )}
    </Stack>
  );
}
