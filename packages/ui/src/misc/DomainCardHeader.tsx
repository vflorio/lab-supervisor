import { Code } from "@mui/icons-material";
import { Box, Stack, Switch, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface DomainCardHeaderProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly showJson: boolean;
  readonly onToggleJson: () => void;
  readonly actions?: ReactNode;
}

export function DomainCardHeader({ icon, title, subtitle, showJson, onToggleJson, actions }: DomainCardHeaderProps) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 2.5 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: "center" }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            bgcolor: "rgba(74,222,128,0.1)",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="monoEyebrow" sx={{ color: "textSecondary", mb: 0.5 }}>
            Domain
          </Typography>
          <Typography variant="monoTitle" sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="textSecondary" sx={{ display: "block", mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
        {actions}
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Typography variant="monoLabel" sx={{ color: "textSecondary" }}>
            JSON
          </Typography>
          <Switch checked={showJson} onChange={onToggleJson} size="small" color="primary" />
          <Code sx={{ fontSize: 14, color: showJson ? "primary.main" : "textSecondary" }} />
        </Stack>
      </Stack>
    </Stack>
  );
}
