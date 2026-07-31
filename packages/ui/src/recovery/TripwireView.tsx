import { NotificationsActive } from "@mui/icons-material";
import { Box, Chip, Stack, Typography } from "@mui/material";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { useState } from "react";
import { DomainCardAccordion } from "../misc/DomainCardAccordion";
import { NotifyRuleView } from "../notify/NotifyRuleView";
import { PipelineView } from "../pipeline/PipelineView";
import { PredicateExpressionView } from "../predicates/PredicateExpressionView";
import { RetryPolicyView } from "../retry-policy/RetryPolicyView";

const darkBox = { bgcolor: "#0a0c0e", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 } as const;

const predicateSummary = (expr: PredicateExpression): string => (expr.type === "leaf" ? expr.leaf.name : expr.type);

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="monoEyebrow" color="textSecondary" sx={{ mb: 1 }}>
      {children}
    </Typography>
  );
}

export interface TripwireViewProps {
  readonly tripwire: RecoveryTripwire;
  readonly index: number;
}

export function TripwireView({ tripwire, index }: TripwireViewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <DomainCardAccordion
      icon={<NotificationsActive sx={{ fontSize: 13, color: "warning.main" }} />}
      title={
        <Typography variant="monoTitle" sx={{ fontWeight: 600 }}>
          tripwire #{index + 1}
        </Typography>
      }
      trailing={
        <>
          <Chip label={`grace: ${tripwire.grace}`} size="small" color="warning" sx={{ height: 18 }} />
          <Chip label={predicateSummary(tripwire.predicate)} size="small" color="success" sx={{ height: 18 }} />
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
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
    </DomainCardAccordion>
  );
}
