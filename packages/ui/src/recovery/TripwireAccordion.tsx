import { ExpandLess, ExpandMore, NotificationsActive } from "@mui/icons-material";
import { Box, Chip, Stack, Typography } from "@mui/material";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { useState } from "react";
import { NotifyRuleView } from "../notify/NotifyRuleView";
import { PipelineView } from "../pipeline/PipelineView";
import { PredicateExpressionView } from "../predicates/PredicateExpressionView";
import { RetryPolicyView } from "../retry-policy/RetryPolicyView";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const darkBox = { bgcolor: "#0a0c0e", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 } as const;

// "ref"/"equals"/"includes" hanno tutti un `name`; and/or/not no - fallback sul type per non
// far leggere un nome fuorviante su un predicato composto.
const predicateSummary = (expr: PredicateExpression): string => ("name" in expr ? expr.name : expr.type);

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        ...mono,
        fontSize: 9,
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        mb: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

// Blocco readonly per un singolo RecoveryTripwire: stessa struttura del TripwireBlock del
// mockup figma (predicate/pipeline/retry/notify su box scuri annidati), riusando le View gia'
// esistenti (PredicateExpressionView/PipelineView/RetryPolicyView/NotifyRuleView).
export interface TripwireAccordionProps {
  readonly tripwire: RecoveryTripwire;
  readonly index: number;
}

export function TripwireAccordion({ tripwire, index }: TripwireAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
      <Stack
        direction="row"
        onClick={() => setExpanded((v) => !v)}
        sx={{ gap: 1.25, alignItems: "center", px: 1.5, py: 1, cursor: "pointer" }}
      >
        <NotificationsActive sx={{ fontSize: 13, color: "warning.main" }} />
        <Typography sx={{ ...mono, fontSize: 12, fontWeight: 600 }}>tripwire #{index + 1}</Typography>
        <Chip
          label={`grace: ${tripwire.grace}`}
          size="small"
          color="warning"
          sx={{ ...mono, fontSize: 10, height: 18 }}
        />
        <Chip
          label={predicateSummary(tripwire.predicate)}
          size="small"
          color="success"
          sx={{ ...mono, fontSize: 10, height: 18 }}
        />
        <Box sx={{ flex: 1 }} />
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </Stack>
      {expanded && (
        <Box sx={{ bgcolor: "#0d0f11", borderTop: "1px solid", borderColor: "divider", p: 1.5 }}>
          <Stack sx={{ gap: 2 }}>
            <Box>
              <FieldLabel>Predicate</FieldLabel>
              <Box sx={darkBox}>
                <PredicateExpressionView value={tripwire.predicate} />
              </Box>
            </Box>
            <Box>
              <FieldLabel>Pipeline</FieldLabel>
              <Box sx={darkBox}>
                <PipelineView value={tripwire.pipeline} />
              </Box>
            </Box>
            <Box>
              <FieldLabel>Retry</FieldLabel>
              <Box sx={darkBox}>
                <RetryPolicyView value={tripwire.retry} />
              </Box>
            </Box>
            {tripwire.notify && tripwire.notify.length > 0 && (
              <Box>
                <FieldLabel>Notify</FieldLabel>
                <Stack sx={{ gap: 0.75 }}>
                  {tripwire.notify.map((rule, ruleIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: NotifyRule non ha id, sola lettura
                    <Box key={ruleIndex} sx={darkBox}>
                      <NotifyRuleView value={rule} />
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
