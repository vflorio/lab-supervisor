import { ArrowBack, ArrowForward, Check, Close } from "@mui/icons-material";
import { Box, Button, Drawer, IconButton, Step, StepLabel, Stepper, Typography } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import * as Facts from "@supervisor/core/fact/condition";
import type { NotifyTargetSchema } from "@supervisor/core/notify/codec";
import type { NotifyRule } from "@supervisor/core/notify/model";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import type { PolicyJson, PolicyStepSchema } from "@supervisor/core/retry/codec";
import { useState } from "react";
import { DurationForm } from "../duration/DurationForm";
import { type FactOption, FactRefPicker } from "../fact/FactRefPicker";
import { JsonView } from "../misc/JsonView";
import { NotifyRuleListForm } from "../notify/NotifyRuleListForm";
import { buildPipeline, PipelineWorkflowPicker } from "../pipeline/PipelineWorkflowPicker";
import { RetryPolicyForm } from "../retry-policy/RetryPolicyForm";
import { RecoveryTripwireView } from "./RecoveryTripwireView";

const STEPS = ["Fact", "Grace", "Pipeline", "Retry", "Notify", "Review"] as const;

interface WizardState {
  readonly factName: string;
  readonly grace: DurationString;
  readonly selectedWorkflows: readonly string[];
  readonly pipelineOp: "or" | "and";
  readonly retry: PolicyJson;
  readonly notify: readonly NotifyRule[];
}

const INITIAL_STATE: WizardState = {
  factName: "",
  grace: "10s" as DurationString,
  selectedWorkflows: [],
  pipelineOp: "or",
  retry: [],
  notify: [],
};

const buildTripwire = (state: WizardState): RecoveryTripwire => ({
  grace: state.grace,
  predicate: Facts.truthy(state.factName),
  pipeline: buildPipeline(state.selectedWorkflows, state.pipelineOp) ?? { type: "workflow", workflowName: "" },
  retry: state.retry,
  notify: state.notify.length > 0 ? state.notify : undefined,
});

const CAN_NEXT: readonly ((state: WizardState) => boolean)[] = [
  (s) => !!s.factName,
  (s) => !!s.grace,
  (s) => s.selectedWorkflows.length > 0,
  (s) => s.retry.length > 0,
  () => true,
];

export interface TripwireWizardProps {
  readonly open: boolean;
  readonly domain: string;
  readonly onClose: () => void;
  readonly onSave: (tripwire: RecoveryTripwire) => void;
  readonly workflowNames: readonly string[];
  readonly factOptions: readonly FactOption[];
  readonly retrySchema: readonly PolicyStepSchema[];
  readonly notifyTargetSchema: readonly NotifyTargetSchema[];
}

export function TripwireWizard({
  open,
  domain,
  onClose,
  onSave,
  workflowNames,
  factOptions,
  retrySchema,
  notifyTargetSchema,
}: TripwireWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const patch = (next: Partial<WizardState>) => setState((prev) => ({ ...prev, ...next }));

  const reset = () => {
    setStep(0);
    setState(INITIAL_STATE);
  };

  const toggleWorkflow = (name: string) =>
    patch({
      selectedWorkflows: state.selectedWorkflows.includes(name)
        ? state.selectedWorkflows.filter((w) => w !== name)
        : [...state.selectedWorkflows, name],
    });

  const canNext = CAN_NEXT[step]?.(state) ?? true;
  const isLastStep = step === STEPS.length - 1;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 520, display: "flex", flexDirection: "column" } } }}
    >
      <Box
        sx={{
          px: 3,
          py: 2.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Box>
          <Typography variant="overline" color="textSecondary" sx={{ mb: 0.5 }}>
            recovery - {domain}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Nuovo Tripwire
          </Typography>
        </Box>
        <IconButton color="secondary" size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Box>

      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label, index) => (
            <Step key={label} completed={index < step}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
        {step === 0 && (
          <FactRefPicker
            options={factOptions}
            value={state.factName}
            onChange={(predicateName) => patch({ factName: predicateName })}
          />
        )}
        {step === 1 && <DurationForm label="grace" value={state.grace} onChange={(grace) => patch({ grace })} />}
        {step === 2 && (
          <PipelineWorkflowPicker
            workflowNames={workflowNames}
            selected={state.selectedWorkflows}
            onToggle={toggleWorkflow}
            op={state.pipelineOp}
            onOpChange={(pipelineOp) => patch({ pipelineOp })}
          />
        )}
        {step === 3 && (
          <RetryPolicyForm value={state.retry} onChange={(retry) => patch({ retry })} schema={retrySchema} />
        )}
        {step === 4 && (
          <NotifyRuleListForm
            value={state.notify}
            onChange={(notify) => patch({ notify })}
            targetSchema={notifyTargetSchema}
          />
        )}
        {step === 5 && (
          <Box>
            <RecoveryTripwireView value={buildTripwire(state)} />
            <Box sx={{ mt: 2 }}>
              <JsonView data={buildTripwire(state)} />
            </Box>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          px: 3,
          py: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Button
          size="small"
          startIcon={<ArrowBack sx={{ fontSize: 13 }} />}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          sx={{ visibility: step === 0 ? "hidden" : "visible" }}
        >
          Indietro
        </Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            size="small"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Annulla
          </Button>
          {isLastStep ? (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<Check sx={{ fontSize: 13 }} />}
              onClick={() => {
                onSave(buildTripwire(state));
                reset();
              }}
            >
              Salva tripwire
            </Button>
          ) : (
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={!canNext}
              endIcon={<ArrowForward sx={{ fontSize: 13 }} />}
              onClick={() => {
                if (canNext) setStep((s) => s + 1);
              }}
            >
              Avanti
            </Button>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
