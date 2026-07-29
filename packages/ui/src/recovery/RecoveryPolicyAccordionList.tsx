import { Add, ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, Button, Chip, IconButton, Stack, Typography } from "@mui/material";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import type { PolicyStepSchema } from "@supervisor/core/retry/codec";
import { useEffect, useState } from "react";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { RecoveryPolicyForm } from "./RecoveryPolicyForm";
import { TripwireAccordion } from "./TripwireAccordion";
import { TripwireWizard } from "./TripwireWizard";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const fieldBox = {
  bgcolor: "#0a0c0e",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1,
  px: 1.5,
  py: 1,
} as const;

// Lista di RecoveryPolicy ad accordion (dominio -> tripwire), stesso pattern DIY di
// WorkflowAccordionList. In sola lettura mostra i box scuri annidati del mockup figma
// (TripwireAccordion); in editing passa a RecoveryPolicyForm (editor strutturato gia'
// esistente) + il TripwireWizard per aggiungere un tripwire guidato invece che a mano.
export interface RecoveryPolicyAccordionListProps {
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

export function RecoveryPolicyAccordionList({
  policies,
  editing,
  retrySchema,
  notifyTargetSchema,
  workflowNames,
  predicateOptions,
  onChange,
  onCreate,
  focusLabel,
}: RecoveryPolicyAccordionListProps) {
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
      <Stack sx={{ gap: 1 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography
            color="textSecondary"
            sx={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {policies.length} dominio/i di recovery
          </Typography>
          {editing && onCreate && (
            <IconButton size="small" onClick={onCreate} title="New recovery policy">
              <Add fontSize="small" />
            </IconButton>
          )}
        </Stack>

        {policies.map((policy) => (
          <Box
            key={policy.label}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}
          >
            <Stack
              direction="row"
              onClick={() => toggle(policy.label)}
              sx={{ gap: 1.25, alignItems: "center", px: 1.5, py: 1, cursor: "pointer" }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />
              <Typography sx={{ ...mono, fontSize: 12, fontWeight: 600 }}>{policy.domain}</Typography>
              <Typography sx={{ ...mono, fontSize: 11, color: "textSecondary" }}>/ {policy.label}</Typography>
              <Chip
                label={`${policy.tripwires.length} tripwires`}
                size="small"
                sx={{ ...mono, fontSize: 10, height: 18, borderRadius: "4px" }}
              />
              <Box sx={{ flex: 1 }} />
              {expanded.has(policy.label) ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </Stack>

            {expanded.has(policy.label) && (
              <Box sx={{ bgcolor: "#0d0f11", borderTop: "1px solid", borderColor: "divider", p: 1.5 }}>
                {editing ? (
                  <RecoveryPolicyForm
                    value={policy}
                    onChange={onChange}
                    retrySchema={retrySchema}
                    notifyTargetSchema={notifyTargetSchema}
                  />
                ) : (
                  <Stack sx={{ gap: 1.5 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                      {[
                        { key: "domain", value: policy.domain },
                        { key: "label", value: policy.label },
                      ].map((field) => (
                        <Box key={field.key} sx={fieldBox}>
                          <Typography sx={{ ...mono, fontSize: 9, color: "textSecondary", mb: 0.5 }}>
                            {field.key}
                          </Typography>
                          <Typography sx={{ ...mono, fontSize: 12 }}>{field.value}</Typography>
                        </Box>
                      ))}
                    </Box>
                    <Stack sx={{ gap: 1 }}>
                      {policy.tripwires.map((tripwire, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: RecoveryTripwire non ha id, sola lettura
                        <TripwireAccordion key={index} tripwire={tripwire} index={index} />
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
                    sx={{ mt: 1.5, ...mono, fontSize: 11 }}
                  >
                    Nuovo tripwire
                  </Button>
                )}
              </Box>
            )}
          </Box>
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
