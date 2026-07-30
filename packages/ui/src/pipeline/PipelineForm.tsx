import { Box } from "@mui/material";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import { Picker } from "../picker/Picker";
import { type PipelineLeaf, pipelineTreeOps } from "./ops";

const DEFAULT_LEAF: PipelineLeaf = { type: "workflow", workflowName: "" };

export interface PipelineFormProps {
  readonly value: Pipeline;
  readonly onChange: (next: Pipeline) => void;
  readonly workflowNames: readonly string[];
}

export function PipelineForm({ value, onChange, workflowNames }: PipelineFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={pipelineTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => (
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
    />
  );
}
