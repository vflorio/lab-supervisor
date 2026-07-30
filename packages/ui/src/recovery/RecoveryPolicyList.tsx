import { Add } from "@mui/icons-material";
import { Box, Button, Chip, IconButton, Stack, Typography } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import type { PolicyStepSchema } from "@supervisor/core/retry/codec";
import { useEffect, useState } from "react";
import { DomainCardAccordion } from "../misc/DomainCardAccordion";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { RecoveryPolicyForm } from "./RecoveryPolicyForm";
import { TripwireView } from "./TripwireView";
import { TripwireWizard } from "./TripwireWizard";

const fieldBox = {
  bgcolor: "#0a0c0e",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1,
  px: 1.5,
  py: 1,
} as const;

export interface RecoveryPolicyListProps {
  readonly policies: readonly RecoveryPolicy[];
  readonly editing: boolean;
  readonly retrySchema: readonly PolicyStepSchema[];
  readonly notifyTargetSchema: readonly NotifyTargetSchema[];
  readonly workflowNames: readonly string[];
  readonly predicateOptions: readonly PredicateOption[];
  readonly onChange: (next: RecoveryPolicy) => void;
  readonly onCreate?: () => void;
  readonly focusLabel?: string;
}

export function RecoveryPolicyList({
  policies,
  editing,
  retrySchema,
  notifyTargetSchema,
  workflowNames,
  predicateOptions,
  onChange,
  onCreate,
  focusLabel,
}: RecoveryPolicyListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [wizardFor, setWizardFor] = useState<string | null>(null);

  useEffect(() => {
    if (focusLabel) setExpanded((prev) => new Set(prev).add(focusLabel));
  }, [focusLabel]);

  const toggle = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const wizardPolicy = policies.find((p) => p.label === wizardFor);

  return (
    <>
      <Stack sx={{ gap: 1, pt: 1 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="monoEyebrow" color="textSecondary">
            {policies.length} dominio/i di recovery
          </Typography>
          {editing && onCreate && (
            <IconButton size="small" onClick={onCreate} title="New recovery policy">
              <Add fontSize="small" />
            </IconButton>
          )}
        </Stack>

        {policies.map((policy) => (
          <DomainCardAccordion
            key={policy.label}
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />}
            title={
              <>
                <Typography variant="monoTitle" sx={{ fontWeight: 600 }}>
                  {policy.domain}
                </Typography>
                <Typography variant="monoLabel" sx={{ color: "textSecondary" }}>
                  / {policy.label}
                </Typography>
              </>
            }
            trailing={
              <Chip
                label={`${policy.tripwires.length} tripwires`}
                size="small"
                sx={{ height: 18 }}
              />
            }
            expanded={expanded.has(policy.label)}
            onToggle={() => toggle(policy.label)}
          >
            {editing ? (
              <RecoveryPolicyForm
                value={policy}
                onChange={onChange}
                retrySchema={retrySchema}
                notifyTargetSchema={notifyTargetSchema}
                workflowNames={workflowNames}
                predicateOptions={predicateOptions}
              />
            ) : (
              <Stack sx={{ gap: 1.5 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  {[
                    { key: "domain", value: policy.domain },
                    { key: "label", value: policy.label },
                  ].map((field) => (
                    <Box key={field.key} sx={fieldBox}>
                      <Typography variant="monoLabel" sx={{ color: "textSecondary", mb: 0.5 }}>
                        {field.key}
                      </Typography>
                      <Typography variant="monoTitle">{field.value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Stack sx={{ gap: 1 }}>
                  {policy.tripwires.map((tripwire, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: RecoveryTripwire non ha id, sola lettura
                    <TripwireView key={index} tripwire={tripwire} index={index} />
                  ))}
                </Stack>
              </Stack>
            )}
            {editing && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Add sx={{ fontSize: 13 }} />}
                onClick={() => setWizardFor(policy.label)}
                sx={{ mt: 1.5 }}
              >
                Nuovo tripwire
              </Button>
            )}
          </DomainCardAccordion>
        ))}
      </Stack>

      {wizardPolicy && (
        <TripwireWizard
          open={!!wizardFor}
          domain={wizardPolicy.domain}
          onClose={() => setWizardFor(null)}
          onSave={(tripwire) => {
            onChange({ ...wizardPolicy, tripwires: [...wizardPolicy.tripwires, tripwire] });
            setWizardFor(null);
          }}
          workflowNames={workflowNames}
          predicateOptions={predicateOptions}
          retrySchema={retrySchema}
          notifyTargetSchema={notifyTargetSchema}
        />
      )}
    </>
  );
}
