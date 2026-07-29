import { Bolt, Check } from "@mui/icons-material";
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";

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
      <Stack sx={{ gap: 0.75 }}>
        {workflowNames.map((name) => {
          const on = selected.includes(name);
          return (
            <Box
              key={name}
              onClick={() => onToggle(name)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 1,
                border: "1px solid",
                borderColor: on ? "primary.main" : "divider",
                bgcolor: on ? "action.selected" : "transparent",
                cursor: "pointer",
              }}
            >
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: 0.5,
                  border: "1px solid",
                  borderColor: on ? "primary.main" : "divider",
                  bgcolor: on ? "primary.main" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {on && <Check sx={{ fontSize: 10, color: "primary.contrastText" }} />}
              </Box>
              <Bolt sx={{ fontSize: 12, color: on ? "primary.main" : "text.secondary" }} />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {name}
              </Typography>
            </Box>
          );
        })}
      </Stack>
      {selected.length >= 2 && (
        <Box>
          <Typography variant="overline" color="text.secondary">
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
