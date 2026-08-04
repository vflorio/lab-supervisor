import { Box, MenuItem, Select, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import type { FactValue } from "@supervisor/core/fact/model";
import { FieldLabel } from "../misc/FieldLabel";
import { NumberField } from "../misc/number-field/NumberField";
import { type FactOption, FactRefPicker } from "./FactRefPicker";
import type { FactLeaf } from "./ops";

export interface FactLeafFormProps {
  readonly value: FactLeaf;
  readonly onChange: (next: FactLeaf) => void;
  readonly factOptions: readonly FactOption[];
}

type ValueKind = "boolean" | "string" | "number";

const valueKindOf = (value: FactValue): ValueKind =>
  typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string";

const defaultForKind = (kind: ValueKind): FactValue => (kind === "boolean" ? false : kind === "number" ? 0 : "");

function ValueEditor({ value, onChange }: { value: FactValue; onChange: (next: FactValue) => void }) {
  const kind = valueKindOf(value);

  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
      <Select
        size="small"
        value={kind}
        onChange={(event: SelectChangeEvent) => onChange(defaultForKind(event.target.value as ValueKind))}
        sx={{ minWidth: 90 }}
      >
        <MenuItem value="boolean">boolean</MenuItem>
        <MenuItem value="string">string</MenuItem>
        <MenuItem value="number">number</MenuItem>
      </Select>
      {kind === "boolean" && (
        <Select
          size="small"
          value={String(value)}
          onChange={(event: SelectChangeEvent) => onChange(event.target.value === "true")}
          sx={{ minWidth: 90 }}
        >
          <MenuItem value="true">true</MenuItem>
          <MenuItem value="false">false</MenuItem>
        </Select>
      )}
      {kind === "number" && (
        <NumberField label="value" value={typeof value === "number" ? value : 0} onChange={onChange} width={100} />
      )}
      {kind === "string" && (
        <FieldLabel label="value" width={160}>
          <TextField
            size="small"
            fullWidth
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </FieldLabel>
      )}
    </Stack>
  );
}

const KINDS = ["ref", "equals", "includes"] as const;

const leafFor = (kind: (typeof KINDS)[number], name: string): FactLeaf =>
  kind === "ref"
    ? { type: "ref", name }
    : kind === "equals"
      ? { type: "equals", name, value: false }
      : { type: "includes", name, value: "" };

export function FactLeafForm({ value, onChange, factOptions }: FactLeafFormProps) {
  return (
    <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Select
        size="small"
        value={value.type}
        onChange={(event: SelectChangeEvent) =>
          onChange(leafFor(event.target.value as (typeof KINDS)[number], value.name))
        }
        sx={{ minWidth: 110 }}
      >
        {KINDS.map((kind) => (
          <MenuItem key={kind} value={kind}>
            {kind}
          </MenuItem>
        ))}
      </Select>
      <Box sx={{ minWidth: 340 }}>
        <FactRefPicker options={factOptions} value={value.name} onChange={(name) => onChange({ ...value, name })} />
      </Box>
      {value.type === "equals" && (
        <ValueEditor value={value.value} onChange={(next) => onChange({ ...value, value: next })} />
      )}
      {value.type === "includes" && (
        <FieldLabel label="substring" width={160}>
          <TextField
            size="small"
            fullWidth
            value={value.value}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
          />
        </FieldLabel>
      )}
    </Stack>
  );
}
