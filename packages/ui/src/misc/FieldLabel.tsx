import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import type { ReactNode } from "react";

// Overlay assoluto per una piccola label sopra un field bordato (TextField/Select/
// NumberField...): non occupa altezza di layout, cosi' i field restano allineati sulla
// stessa riga indipendentemente dalla presenza della label - stesso trucco della label
// "shrunk" di MUI TextField, ma un'unica implementazione condivisa da tutte le pure
// config form invece di un mix di InputLabel di MUI e overlay custom.
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
  fontFamily: "'JetBrains Mono', monospace",
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
