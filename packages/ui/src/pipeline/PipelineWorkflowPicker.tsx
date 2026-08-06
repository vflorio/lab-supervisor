import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { MultiPicker } from "../picker/MultiPicker";

// Deriva una Pipeline da una selezione piatta di nomi di workflow + operatore: 0 nomi -> null
// (nessuna pipeline), 1 -> leaf diretto, N -> or/and dei singoli leaf. Guidato, non riscrive un
// albero esistente (a differenza di PipelineForm) - pensato per il TripwireWizard, che costruisce
// una pipeline da zero passo per passo.
export const buildPipeline = (selected: readonly string[], op: "or" | "and"): Pipeline | null => {
  if (selected.length === 0) return null;
  if (selected.length === 1) return { type: "workflow", workflowName: selected[0]! };
  return { type: op, pipelines: selected.map((workflowName) => ({ type: "workflow" as const, workflowName })) };
};

export interface PipelineWorkflowPickerProps {
  readonly workflowNames: readonly string[];
  readonly selected: readonly string[];
  readonly onToggle: (name: string) => void;
  readonly op: "or" | "and";
  readonly onOpChange: (op: "or" | "and") => void;
}

export function PipelineWorkflowPicker({
  workflowNames,
  selected,
  onToggle,
  op,
  onOpChange,
}: PipelineWorkflowPickerProps) {
  return (
    <Stack sx={{ gap: 2 }}>
      <MultiPicker
        options={workflowNames.map((name) => ({ id: name, primary: name }))}
        value={selected}
        onChange={(next) => {
          // MultiPicker riporta la selezione completa dopo ogni interazione, che tocca sempre
          // un solo elemento alla volta - lo isoliamo per restare sull'API onToggle esistente.
          const changed = next.find((id) => !selected.includes(id)) ?? selected.find((id) => !next.includes(id));
          if (changed) onToggle(changed);
        }}
        placeholder="Cerca workflow..."
      />
      {selected.length >= 2 && (
        <Box>
          <Typography variant="overline" color="textSecondary">
            Operatore logico
          </Typography>
          <ToggleButtonGroup
            value={op}
            exclusive
            size="small"
            onChange={(_, next) => {
              if (next) onOpChange(next);
            }}
          >
            <ToggleButton value="or">or</ToggleButton>
            <ToggleButton value="and">and</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}
    </Stack>
  );
}
