import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Intestazione di pagina pura: eyebrow (breadcrumb-like) + titolo + azioni. Non estende
// apps/web/components/Section.tsx (stessa idea ma senza eyebrow) per restare additiva -
// nessun rischio per la pagina esistente, vedi il piano per il perché.
// -------------------------------------------------------------------------------------

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
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block", textTransform: "uppercase", letterSpacing: 0.5 }}
          >
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
