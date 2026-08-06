import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3 }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" color="textSecondary" noWrap sx={{ display: "block" }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h5" sx={{ fontWeight: 600 }} noWrap>
          {title}
        </Typography>
      </Box>
      {actions && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexShrink: 0 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
