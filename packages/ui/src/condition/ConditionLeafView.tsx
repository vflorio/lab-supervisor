import { Chip, Stack, Typography } from "@mui/material";
import type { ConditionLeaf } from "@supervisor/core/workflow/condition";
import { FactLeafView } from "../fact/FactLeafView";

// Readonly: un probe si distingue a colpo d'occhio da un fatto - le due cose hanno costo e
// semantica di fallimento diverse, e chi legge la config deve saperlo senza pensarci.
export interface ConditionLeafViewProps {
  readonly value: ConditionLeaf;
}

export function ConditionLeafView({ value }: ConditionLeafViewProps) {
  if (value.type !== "probe") return <FactLeafView value={value} />;

  return (
    <Stack direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
      <Chip label="probe" size="small" variant="outlined" sx={{ height: 18 }} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value.name}
      </Typography>
      {value.args.length > 0 && (
        <Typography variant="caption" color="textSecondary">
          ({value.args.join(", ")})
        </Typography>
      )}
    </Stack>
  );
}
