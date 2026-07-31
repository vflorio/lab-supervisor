import { Typography } from "@mui/material";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { BooleanTreeView } from "../boolean-tree/BooleanTreeView";
import { ConditionView } from "../condition/ConditionView";
import { pipelineTreeOps } from "./ops";

// Readonly: albero and/or/not generico (vedi ../boolean-tree); il leaf e' un workflow da
// eseguire o una precondizione da valutare.
export interface PipelineViewProps {
  readonly value: Pipeline;
}

export function PipelineView({ value }: PipelineViewProps) {
  return (
    <BooleanTreeView
      value={value}
      ops={pipelineTreeOps}
      renderLeaf={(leaf) =>
        leaf.type === "condition" ? (
          <ConditionView value={leaf.condition} />
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {leaf.workflowName}
          </Typography>
        )
      }
    />
  );
}
