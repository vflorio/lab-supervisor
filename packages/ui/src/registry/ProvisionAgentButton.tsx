import { Build, InstallMobile } from "@mui/icons-material";
import { Button, CircularProgress, Tooltip } from "@mui/material";

export interface ProvisionAgentButtonProps {
  readonly provisioned?: boolean; // undefined = ignoto; false = richiede azione
  readonly installed?: boolean;
  readonly configured: boolean; // false se provisioning non configurato
  readonly busy?: boolean;
  readonly onProvision: () => void;
}

// Mostra quando provisioned=false (app+senza grant e rotto quanto non installato)
export function ProvisionAgentButton({
  provisioned,
  installed,
  configured,
  busy = false,
  onProvision,
}: ProvisionAgentButtonProps) {
  if (!configured || provisioned !== false) return null;

  // L'operatore deve sapere: installa vs ripara (UX diversa)
  const repairing = installed === true;

  return (
    <Tooltip title={repairing ? "Restore the agent's missing permissions" : "Sideload and set up the supervisor agent"}>
      <span>
        <Button
          size="small"
          variant="outlined"
          color={repairing ? "warning" : "primary"}
          disabled={busy}
          startIcon={
            busy ? (
              <CircularProgress size={14} />
            ) : repairing ? (
              <Build fontSize="small" />
            ) : (
              <InstallMobile fontSize="small" />
            )
          }
          onClick={onProvision}
        >
          {busy ? "Provisioning…" : repairing ? "Repair agent" : "Provision"}
        </Button>
      </span>
    </Tooltip>
  );
}
