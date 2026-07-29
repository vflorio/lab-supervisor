import { ListItemText } from "@mui/material";
import { type ActivitySource, activityKey } from "@supervisor/core/activity/model";
import { useActivity } from "../hooks/useActivity";
import type { ActivityColor } from "./ActivityStatus";

// -------------------------------------------------------------------------------------
// Variante di PredicateStat per la zona `indicators` di EntryRow, ma per Activity invece
// che per i predicati di tracking: stesso formato nome/valore sempre visibile, colorato in
// base allo stato corrente di (source, entityId). Nessuna entry ancora presente è uno stato
// legittimo ("idle"), non un errore.
// -------------------------------------------------------------------------------------

const STATE_TEXT_COLOR: Record<ActivityColor, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface ActivityStatProps {
  readonly source: ActivitySource;
  readonly entityId: string;
  readonly label: string;
  readonly colorFor: (status: string | undefined) => ActivityColor;
  readonly detail?: string | ((status: string | undefined) => string);
}

export interface UseActivityStatArgs {
  readonly source: ActivitySource;
  readonly entityId: string;
  readonly colorFor: (status: string | undefined) => ActivityColor;
  readonly detail?: string | ((status: string | undefined) => string);
}

// Stessa lookup di ActivityStat, esposta come hook cosi' i chiamanti che non vogliono il
// rendering ListItemText (es. le nuove card espandibili, vedi packages/ui/device-card)
// possono comunque riusare la logica invece di duplicarla.
export function useActivityStat({ source, entityId, colorFor, detail }: UseActivityStatArgs) {
  const { table } = useActivity();
  const entry = table.get(activityKey({ source, entityId }));
  const detailText = typeof detail === "function" ? detail(entry?.status) : (detail ?? entry?.status ?? "idle");
  return { detailText, tone: colorFor(entry?.status) };
}

export function ActivityStat({ source, entityId, label, colorFor, detail }: ActivityStatProps) {
  const { detailText, tone } = useActivityStat({ source, entityId, colorFor, detail });

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
            color: "textSecondary",
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
            color: STATE_TEXT_COLOR[tone],
          },
        },
      }}
    />
  );
}
