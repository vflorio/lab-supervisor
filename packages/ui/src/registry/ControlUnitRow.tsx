import { Dns } from "@mui/icons-material";
import { Box, Button } from "@mui/material";
import type { ControlUnitEntry } from "../domain/types";
import { EntryRow } from "../misc/EntryRow";
import { IndicatorStat } from "./IndicatorStat";
import { isRecoveryStuck, RecoveryActivityView } from "./RecoveryActivityView";
import { SuitestControlUnitOnlineView } from "./SuitestControlUnitOnlineView";

export interface ControlUnitRowProps {
  readonly cu: ControlUnitEntry;
  readonly online?: boolean;
  readonly tvCount: number;
  readonly recoveryStatus?: string;
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onSettings?: () => void;
  readonly onResetRecovery?: () => void;
}

// `tvCount` è un numero passato dal chiamante (ControlUnitCard lo deriva dai suoi `children`)
// perché qui le TV non arrivano come dato di dominio: questa riga non le vede affatto.
export function ControlUnitRow({
  cu,
  online,
  tvCount,
  recoveryStatus,
  onToggle,
  onEdit,
  onDelete,
  onSettings,
  onResetRecovery,
}: ControlUnitRowProps) {
  return (
    <EntryRow
      icon={
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(74,222,128,0.1)",
            color: "primary.main",
          }}
        >
          <Dns fontSize="small" />
        </Box>
      }
      label={cu.label}
      secondary={cu.id}
      checked={cu.controlled}
      checkedTitle="Controlled by supervisor"
      indicators={[
        <SuitestControlUnitOnlineView key="online" value={online} />,
        <IndicatorStat key="tvs" label="TVS" value={tvCount} />,
      ]}
      context={<RecoveryActivityView status={recoveryStatus} />}
      actions={[
        onSettings && (
          <Button key="settings" size="small" variant="outlined" onClick={onSettings}>
            Settings
          </Button>
        ),
        isRecoveryStuck(recoveryStatus) && onResetRecovery && (
          <Button key="reset" size="small" variant="outlined" color="error" onClick={onResetRecovery}>
            Reset recovery
          </Button>
        ),
      ]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
