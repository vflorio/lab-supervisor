import { Add } from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { DeviceCardList } from "../registry/DeviceCardList";

// Lista dei workflow configurati + azione "new workflow". Compone DeviceCardList invece
// di reinventare la meccanica di lista.
export interface WorkflowListProps {
  readonly workflows: readonly Workflow[];
  readonly selectedName?: string;
  readonly onSelect: (name: string) => void;
  readonly onCreate: () => void;
}

export function WorkflowList({ workflows, selectedName, onSelect, onCreate }: WorkflowListProps) {
  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="overline" color="text.secondary">
          Workflows
        </Typography>
        <IconButton size="small" onClick={onCreate} title="New workflow">
          <Add fontSize="small" />
        </IconButton>
      </Stack>
      <DeviceCardList items={workflows} getKey={(workflow) => workflow.name}>
        {(workflow) => (
          <Box
            onClick={() => onSelect(workflow.name)}
            sx={{
              cursor: "pointer",
              p: 1,
              borderRadius: 2,
              border: "1px solid",
              borderColor: workflow.name === selectedName ? "primary.main" : "divider",
              bgcolor: workflow.name === selectedName ? "action.selected" : "transparent",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {workflow.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {workflow.commands.length} command{workflow.commands.length === 1 ? "" : "s"}
            </Typography>
          </Box>
        )}
      </DeviceCardList>
    </Stack>
  );
}
