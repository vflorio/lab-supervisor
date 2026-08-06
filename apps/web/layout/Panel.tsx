import { Box } from "@mui/material";
import type { ReactNode } from "react";
import { PanelHeader } from "./PanelHeader";

export interface PanelProps {
  readonly children: ReactNode;
  readonly title?: ReactNode;
  readonly icon?: ReactNode;
  readonly actions?: ReactNode;
}

export function Panel({ children, title, icon, actions }: PanelProps) {
  return (
    <>
      <PanelHeader title={title} icon={icon} actions={actions} />
      <Box sx={{ p: { xs: 2, md: 4 } }}>{children}</Box>
    </>
  );
}
