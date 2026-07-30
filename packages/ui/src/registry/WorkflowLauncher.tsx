import { PlayArrow } from "@mui/icons-material";
import { Box, Button, Popover } from "@mui/material";
import { useState } from "react";
import { Picker } from "../picker/Picker";

export interface WorkflowLauncherProps {
  readonly workflows: readonly string[];
  readonly onLaunch: (workflowName: string) => void;
}

// Bottone + popover con ricerca per lanciare manualmente uno dei workflow configurati contro
// l'entità della riga corrente (§6.3). Nessun workflow configurato -> nulla da lanciare.
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
        Workflow
      </Button>
      <Popover
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 1, width: 260 }}>
          <Picker
            options={workflows.map((name) => ({ id: name, primary: name }))}
            value={null}
            onChange={(name) => {
              if (name) {
                setAnchorEl(null);
                onLaunch(name);
              }
            }}
            placeholder="Search workflow..."
            autoFocus
          />
        </Box>
      </Popover>
    </>
  );
}
