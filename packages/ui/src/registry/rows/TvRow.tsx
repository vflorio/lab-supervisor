import { Link as LinkIcon, Tv } from "@mui/icons-material";
import { Box, Button, Stack } from "@mui/material";
import { Children, type ReactNode } from "react";
import type { TvEntry } from "../../domain/types";
import { EntryRow, entryRowSubgridSx } from "../../misc/EntryRow";
import { ManualWorkflowActivityView } from "../activity/ManualWorkflowActivityView";
import { RearmRecoveryButton, RecoveryActivityView } from "../activity/RecoveryActivityView";
import { SuitestDeviceInUseView } from "../indicators/SuitestDeviceInUseView";
import { SuitestDeviceStatusView } from "../indicators/SuitestDeviceStatusView";
import { WorkflowLauncher } from "../WorkflowLauncher";

export interface TvRowProps {
  readonly tv: TvEntry;
  readonly deviceStatus?: string;
  readonly inUse?: boolean;
  readonly inUseBy?: string;
  readonly recoveryStatus?: string;
  readonly workflowStatus?: string;
  readonly workflows?: readonly string[];
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onLinkCamera?: () => void;
  readonly onRunWorkflow?: (workflowName: string) => void;
  readonly onRearmRecovery?: () => void;
  // Nasconde solo la riga propria della TV, non le camere figlie - stesso principio di
  // ControlUnitCard `showRow` per il toggle "nascondi TVs" nel toolbar della Homepage.
  readonly showRow?: boolean;
  readonly children?: ReactNode;
}

// Le camere figlie arrivano come `children` (il chiamante decide quali CameraRow renderizzare),
// racchiuse in un wrapper a subgrid indentato solo quando espanso. Espandere/comprimere è
// stato di sola vista - non un dato di dominio - quindi vive in un useState locale, default
// espanso per coerenza col mockup.
export function TvRow({
  tv,
  deviceStatus,
  inUse,
  inUseBy,
  recoveryStatus,
  workflowStatus,
  workflows = [],
  onToggle,
  onEdit,
  onDelete,
  onLinkCamera,
  onRunWorkflow,
  onRearmRecovery,
  showRow = true,
  children,
}: TvRowProps) {
  const cameraCount = Children.count(children);

  return (
    <Box sx={{ ...entryRowSubgridSx, rowGap: 1 }}>
      {showRow && (
        <EntryRow
          icon={<Tv fontSize="small" />}
          label={tv.label}
          secondary={tv.ip}
          checked={tv.controlled}
          checkedTitle="Controlled by supervisor"
          indicators={[
            <SuitestDeviceStatusView key="status" value={deviceStatus} />,
            <SuitestDeviceInUseView key="inuse" value={inUse} by={inUseBy} />,
          ]}
          context={
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <RecoveryActivityView status={recoveryStatus} />
              <ManualWorkflowActivityView status={workflowStatus} />
            </Stack>
          }
          actions={[
            onLinkCamera && (
              <Button
                key="link"
                size="small"
                variant="outlined"
                startIcon={<LinkIcon fontSize="small" />}
                onClick={onLinkCamera}
              >
                Link camera
              </Button>
            ),
            onRunWorkflow && <WorkflowLauncher key="wf" workflows={workflows} onLaunch={onRunWorkflow} />,
            <RearmRecoveryButton key="reset" recoveryStatus={recoveryStatus} onRearmRecovery={onRearmRecovery} />,
          ]}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      {cameraCount > 0 && (
        <Box sx={{ ...entryRowSubgridSx, rowGap: 1, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
