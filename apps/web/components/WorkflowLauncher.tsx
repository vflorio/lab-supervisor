import { PlayArrow } from "@mui/icons-material";
import { Box, Button, Popover } from "@mui/material";
import { Picker } from "@supervisor/ui/picker";
import { useState } from "react";

// -------------------------------------------------------------------------------------
// Bottone + popover con ricerca per lanciare manualmente uno dei workflow configurati
// (config `workflows`) contro l'entità della row corrente - vedi CameraRow.tsx. Popover
// (non Menu) perché Autocomplete dentro un MenuList genera conflitti di focus/keyboard nav.
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
      <Popover
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 1, width: 260 }}>
          <Picker
            options={workflows.map((workflow) => ({ id: workflow.name, primary: workflow.name }))}
            value={null}
            onChange={(name) => {
              if (name) {
                setAnchorEl(null);
                onLaunch(name);
              }
            }}
            placeholder="Cerca workflow..."
            autoFocus
          />
        </Box>
      </Popover>
    </>
  );
}
