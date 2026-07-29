import { PlayArrow } from "@mui/icons-material";
import { Button, Menu, MenuItem } from "@mui/material";
import { useState } from "react";

// -------------------------------------------------------------------------------------
// Bottone + menu a scomparsa per lanciare manualmente uno dei workflow configurati
// (config `workflows`) contro l'entità della row corrente - vedi CameraRow.tsx.
// -------------------------------------------------------------------------------------

export interface WorkflowLauncherProps {
  readonly workflows: readonly { name: string }[];
  readonly onLaunch: (workflowName: string) => void;
}

export function WorkflowLauncher({ workflows, onLaunch }: WorkflowLauncherProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (workflows.length === 0) return null;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PlayArrow fontSize="small" />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        Launch workflow
      </Button>
      <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={() => setAnchorEl(null)}>
        {workflows.map((workflow) => (
          <MenuItem
            key={workflow.name}
            onClick={() => {
              setAnchorEl(null);
              onLaunch(workflow.name);
            }}
          >
            {workflow.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
