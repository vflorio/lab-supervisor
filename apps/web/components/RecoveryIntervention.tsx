import { Build } from "@mui/icons-material";
import { Button, Chip } from "@mui/material";
import { useRecoveryIntervention } from "../hooks/useRecovery";

// -------------------------------------------------------------------------------------
// Marcatore + azione correttiva per un tripwire "exhausted" (retry esauriti senza successo -
// vedi recovery/tripwire-machine.ts, TODO "Marcare device come intervento manuale necessario"):
// già notificato via Slack/toast al momento del fatto, qui invece serve un marcatore
// persistente nella entry row + il modo di riarmarlo dopo che l'operatore ha risolto il
// problema fisico. Badge (zona `indicators`, marcatore passivo) e bottone (zona `actions`,
// azione cliccabile) sono componenti separati per rispettare la semantica delle due zone di
// EntryRow, ma condividono la stessa lookup (useRecoveryIntervention).
// -------------------------------------------------------------------------------------

export interface RecoveryInterventionProps {
  readonly domain: string;
  readonly entityId: string;
}

export function RecoveryInterventionBadge({ domain, entityId }: RecoveryInterventionProps) {
  const entries = useRecoveryIntervention(domain, entityId);
  if (entries.length === 0) return null;

  return <Chip size="small" color="error" icon={<Build fontSize="small" />} label="Manual intervention" />;
}

export interface RecoveryResetButtonsProps extends RecoveryInterventionProps {
  readonly onReset: (policy: string, entityId: string, tripwireIndex: number) => void;
}

export function RecoveryResetButtons({ domain, entityId, onReset }: RecoveryResetButtonsProps) {
  const entries = useRecoveryIntervention(domain, entityId);

  return (
    <>
      {entries.map((entry) => (
        <Button
          key={`${entry.policy}:${entry.tripwireIndex}`}
          size="small"
          variant="outlined"
          color="error"
          onClick={() => onReset(entry.policy, entry.entityId, entry.tripwireIndex)}
        >
          Reset recovery
        </Button>
      ))}
    </>
  );
}
