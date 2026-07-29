import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, IconButton, Stack, useMediaQuery } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { type ReactNode, useState } from "react";
import { DetailGrid, type DetailItem } from "./DetailGrid";
import { DeviceCard } from "./DeviceCard";

// Wrappa DeviceCard aggiungendo expand/collapse locale + figli annidati indentati a thread.
export interface EntryCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly status?: ReactNode;
  readonly summary?: ReactNode;
  readonly actions?: ReactNode;
  readonly details?: readonly DetailItem[];
  readonly expandedActions?: ReactNode;
  readonly defaultExpanded?: boolean;
  readonly children?: ReactNode;
}

export function EntryCard({
  icon,
  title,
  subtitle,
  status,
  summary,
  actions,
  details,
  expandedActions,
  defaultExpanded,
  children,
}: EntryCardProps) {
  const prefersExpanded = useMediaQuery((theme: Theme) => theme.breakpoints.up("lg"));
  const [expanded, setExpanded] = useState(defaultExpanded ?? prefersExpanded);
  const hasBody = Boolean((details && details.length > 0) || expandedActions || children);
  const toggle = () => setExpanded((current) => !current);

  return (
    <Box>
      <Box onClick={hasBody ? toggle : undefined} sx={{ cursor: hasBody ? "pointer" : "default" }}>
        <DeviceCard
          icon={icon}
          title={title}
          subtitle={subtitle}
          status={status}
          description={summary}
          actions={
            (actions || hasBody) && (
              <Stack direction="row" sx={{ gap: 1, alignItems: "center" }} onClick={(event) => event.stopPropagation()}>
                {actions}
                {hasBody && (
                  <IconButton size="small" onClick={toggle} title={expanded ? "Collapse" : "Expand"}>
                    {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                  </IconButton>
                )}
              </Stack>
            )
          }
        />
      </Box>
      {expanded && hasBody && (
        <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {details && details.length > 0 && <DetailGrid items={details} />}
          {expandedActions && (
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              {expandedActions}
            </Stack>
          )}
          {children && (
            <Box
              sx={{
                pl: 3,
                borderLeft: "2px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              {children}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
