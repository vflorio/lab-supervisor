import { ListItemText } from "@mui/material";
import { factKey, type PredicateValue } from "@supervisor/core/predicates/model";
import { usePredicates } from "../hooks/usePredicates";

// -------------------------------------------------------------------------------------
// Stato di un predicato di tracking (vedi usePredicates), mostrato come coppia
// nome/valore sempre visibile - niente tooltip, il colore riflette lo stato cosi'
// da restare leggibile a colpo d'occhio.
// -------------------------------------------------------------------------------------

export type StatColor = "success" | "error" | "warning" | "info" | "disabled";

const STATE_TEXT_COLOR: Record<StatColor, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface PredicateStatProps {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
  readonly label: string;
  readonly colorFor: (value: PredicateValue | undefined) => StatColor;
  readonly detail?: string | ((value: PredicateValue | undefined) => string);
}

export function PredicateStat({ domain, entityId, name, label, colorFor, detail }: PredicateStatProps) {
  const { table } = usePredicates();
  const entry = table.get(factKey({ domain, entityId, name }));
  const detailText =
    typeof detail === "function" ? detail(entry?.value) : (detail ?? String(entry?.value ?? "unknown"));

  return (
    <ListItemText
      sx={{ my: 0, flex: "0 0 auto", textAlign: "right" }}
      primary={label}
      secondary={detailText}
      slotProps={{
        primary: {
          sx: {
            display: "block",
            fontSize: "0.65rem",
            lineHeight: 1.4,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          },
        },
        secondary: {
          sx: {
            display: "block",
            fontSize: "0.75rem",
            lineHeight: 1.4,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: STATE_TEXT_COLOR[colorFor(entry?.value)],
          },
        },
      }}
    />
  );
}
