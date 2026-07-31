import { Box, MenuItem, Select, type SelectChangeEvent, Stack } from "@mui/material";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import { ConditionForm } from "../condition/ConditionForm";
import { Picker } from "../picker/Picker";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { type PipelineLeaf, pipelineTreeOps } from "./ops";

const DEFAULT_LEAF: PipelineLeaf = { type: "workflow", workflowName: "" };

const DEFAULT_CONDITION_LEAF: PipelineLeaf = {
  type: "condition",
  condition: { type: "leaf", leaf: { type: "ref", name: "" } },
};

export interface PipelineFormProps {
  readonly value: Pipeline;
  readonly onChange: (next: Pipeline) => void;
  readonly workflowNames: readonly string[];
  readonly predicateOptions?: readonly PredicateOption[];
}

export function PipelineForm({ value, onChange, workflowNames, predicateOptions = [] }: PipelineFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={pipelineTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => (
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Select
            size="small"
            value={leaf.type}
            onChange={(event: SelectChangeEvent) =>
              onLeafChange(event.target.value === "condition" ? DEFAULT_CONDITION_LEAF : DEFAULT_LEAF)
            }
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="workflow" title="Esegue un workflow">
              workflow
            </MenuItem>
            <MenuItem value="condition" title="Precondizione: non esegue nulla, vale quello che dice">
              condition
            </MenuItem>
          </Select>
          {leaf.type === "condition" ? (
            <ConditionForm
              value={leaf.condition}
              onChange={(condition) => onLeafChange({ type: "condition", condition })}
              predicateOptions={predicateOptions}
            />
          ) : (
            <Box sx={{ width: 200 }}>
              <Picker
                options={workflowNames.map((name) => ({ id: name, primary: name }))}
                value={leaf.workflowName || null}
                onChange={(name) => onLeafChange({ ...leaf, workflowName: name ?? "" })}
                label="workflow name"
                placeholder="Cerca workflow..."
              />
            </Box>
          )}
        </Stack>
      )}
    />
  );
}
