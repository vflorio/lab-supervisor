import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, Stack } from "@mui/material";
import type { ReactNode } from "react";

export interface DomainCardAccordionProps {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly trailing?: ReactNode;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

export function DomainCardAccordion({ icon, title, trailing, expanded, onToggle, children }: DomainCardAccordionProps) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        onClick={onToggle}
        sx={{ gap: 1.25, alignItems: "center", px: 1.5, py: 1, cursor: "pointer" }}
      >
        {icon}
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flex: 1, minWidth: 0 }}>
          {title}
        </Stack>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexShrink: 0 }}>
          {trailing}
        </Stack>
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </Stack>
      {expanded && (
        <Box sx={{ bgcolor: "#0d0f11", borderTop: "1px solid", borderColor: "divider", p: 1.5 }}>{children}</Box>
      )}
    </Box>
  );
}
