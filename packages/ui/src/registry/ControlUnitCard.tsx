import { Dns } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import { Children, type ReactNode } from "react";
import type { ControlUnitEntry } from "../domain/types";
import { entryRowGridSx, entryRowSubgridSx } from "../misc/EntryRow";
import { ControlUnitRow, type ControlUnitRowProps } from "./ControlUnitRow";

export interface ControlUnitCardProps extends Omit<ControlUnitRowProps, "cu" | "tvCount"> {
  readonly cu: ControlUnitEntry;
  readonly children?: ReactNode;
}

// Card per una singola control unit: stabilisce la griglia condivisa (`entryRowGridSx`) che
// la riga CU e ogni TV figlia (arrivata via `children`) ereditano per subgrid. `tvCount` è
// derivato da `children` invece che richiesto al chiamante, per non duplicare un conteggio
// che la lista di `children` già rappresenta.
export function ControlUnitCard({ children, ...rowProps }: ControlUnitCardProps) {
  const tvCount = Children.count(children);

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          gap: 1,
          alignItems: "center",
          px: 1.5,
          py: 1,
          bgcolor: "#0d0f11",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: 0.75,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(74,222,128,0.1)",
            color: "primary.main",
          }}
        >
          <Dns sx={{ fontSize: 11 }} />
        </Box>
        <Typography variant="monoEyebrow" sx={{ color: "textSecondary" }}>
          Control unit
        </Typography>
      </Stack>
      <Box sx={{ ...entryRowGridSx, px: 2, py: 1.5 }}>
        <ControlUnitRow {...rowProps} tvCount={tvCount} />
        {tvCount > 0 && (
          <Box
            sx={{ ...entryRowSubgridSx, rowGap: 1.5, mt: 1.5, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}
          >
            {children}
          </Box>
        )}
      </Box>
    </Box>
  );
}
