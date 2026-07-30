import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import type { ReactNode } from "react";
import { monoFontFamily } from "../theme";

export interface FieldLabelProps {
  readonly label?: string;
  readonly width?: number | string;
  readonly children: ReactNode;
}

const Label = styled("label")(({ theme }) => ({
  position: "absolute",
  top: -7,
  left: 6,
  padding: "0 4px",
  fontFamily: monoFontFamily,
  fontSize: 12,
  lineHeight: 1,
  color: theme.palette.text.secondary,
  pointerEvents: "none",
  zIndex: 1,
}));

export function FieldLabel({ label, width, children }: FieldLabelProps) {
  return (
    <Box sx={{ position: "relative", display: "inline-flex", width }}>
      {label && <Label>{label}</Label>}
      {children}
    </Box>
  );
}
