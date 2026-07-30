import { TextField } from "@mui/material";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { BooleanTreeForm } from "../boolean-tree/BooleanTreeForm";
import { FieldLabel } from "../misc/FieldLabel";
import { type PipelineLeaf, pipelineTreeOps } from "./ops";

const DEFAULT_LEAF: PipelineLeaf = { type: "workflow", workflowName: "" };

// Form controllata per una Pipeline: albero and/or/not generico (vedi ../boolean-tree), il
// leaf e' un plain workflowName (stesso trattamento del campo "run" di CommandForm, nessun
// riferimento incrociato alla lista dei workflow per restare puro/DI-only).
export interface PipelineFormProps {
  readonly value: Pipeline;
  readonly onChange: (next: Pipeline) => void;
}

export function PipelineForm({ value, onChange }: PipelineFormProps) {
  return (
    <BooleanTreeForm
      value={value}
      onChange={onChange}
      ops={pipelineTreeOps}
      defaultLeaf={DEFAULT_LEAF}
      renderLeafForm={(leaf, onLeafChange) => (
        <FieldLabel label="workflow name" width={200}>
          <TextField
            size="small"
            fullWidth
            value={leaf.workflowName}
            onChange={(event) => onLeafChange({ ...leaf, workflowName: event.target.value })}
          />
        </FieldLabel>
      )}
    />
  );
}
