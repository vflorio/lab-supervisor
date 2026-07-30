import { Link as LinkIcon, Tv } from "@mui/icons-material";
import { Box, Button, Chip, Stack } from "@mui/material";
import { Children, type ReactNode, useState } from "react";
import type { TvEntry } from "../domain/types";
import { EntryRow, entryRowSubgridSx } from "../misc/EntryRow";
import { ManualWorkflowActivityView } from "./ManualWorkflowActivityView";
import { isRecoveryStuck, RecoveryActivityView } from "./RecoveryActivityView";
import { SuitestDeviceInUseView } from "./SuitestDeviceInUseView";
import { SuitestDeviceStatusView } from "./SuitestDeviceStatusView";
import { WorkflowLauncher } from "./WorkflowLauncher";

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
  readonly onResetRecovery?: () => void;
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
  onResetRecovery,
  children,
}: TvRowProps) {
  const [expanded, setExpanded] = useState(true);
  const cameraCount = Children.count(children);

  return (
    <Box sx={{ ...entryRowSubgridSx, rowGap: 1 }}>
      <EntryRow
        icon={<Tv fontSize="small" />}
        label={tv.label}
        secondary={tv.ip}
        checked={tv.controlled}
        checkedTitle="Controlled by supervisor"
        leadingExtra={
          cameraCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              onClick={() => setExpanded((current) => !current)}
              label={`${expanded ? "▲" : "▼"} ${cameraCount}`}
              sx={{ flexShrink: 0 }}
            />
          )
        }
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
      {expanded && cameraCount > 0 && (
        <Box sx={{ ...entryRowSubgridSx, rowGap: 1, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
