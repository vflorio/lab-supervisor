import { Box, CssBaseline, Divider, Stack, ThemeProvider, Typography } from "@mui/material";
import type { DurationString } from "@supervisor/core/date-time";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { POLICY_STEP_SCHEMA, type PolicyJson } from "@supervisor/core/retry/codec";
import * as Schedule from "@supervisor/core/schedule";
import { COMMAND_SCHEMA } from "@supervisor/core/workflow/codec";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { DurationForm, DurationView } from "@supervisor/ui/duration";
import { PipelineForm, PipelineView } from "@supervisor/ui/pipeline";
import { PredicateExpressionForm, PredicateExpressionView } from "@supervisor/ui/predicates";
import { RecoveryPolicyForm, RecoveryPolicyList, RecoveryPolicyView } from "@supervisor/ui/recovery";
import { RetryPolicyForm, RetryPolicyView } from "@supervisor/ui/retry-policy";
import * as UISchedule from "@supervisor/ui/schedule";
import { WorkflowForm, WorkflowList, WorkflowView } from "@supervisor/ui/workflow";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./retry";
import { theme } from "@supervisor/ui/theme";

// Storybook-ish: ogni sezione monta un modulo puro con un payload di esempio, Form e View
// sulla stessa istanza cosi' si vede subito l'effetto di un edit.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack sx={{ gap: 1.5 }}>
      <Typography variant="h6">{title}</Typography>
      {children}
    </Stack>
  );
}

function DurationDemo() {
  const [value, setValue] = useState<DurationString>("2m" as DurationString);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <DurationForm label="delay" value={value} onChange={setValue} />
      <DurationView value={value} />
    </Stack>
  );
}

const initialPolicy: PolicyJson = [
  ["exponentialBackoff", "100ms"],
  ["capDelay", "5s"],
  ["limitRetries", 10],
];

function RetryPolicyDemo() {
  const [value, setValue] = useState<PolicyJson>(initialPolicy);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <RetryPolicyForm value={value} onChange={setValue} schema={POLICY_STEP_SCHEMA} />
      <RetryPolicyView value={value} />
    </Stack>
  );
}

const initialWorkflows: Workflow[] = [
  {
    name: "wake_and_check",
    commands: [
      { type: "wakeUp" },
      { type: "waitForDevice" },
      { type: "sleep", duration: "2s" as DurationString },
      { type: "ensureActivity", packageId: "com.example.app", activity: ".MainActivity" },
    ],
  },
  {
    name: "restart_app",
    commands: [
      { type: "restartApp", packageId: "com.example.app" },
      { type: "waitForActivity", activity: ".MainActivity" },
    ],
  },
];

function WorkflowDemo() {
  const [workflows, setWorkflows] = useState<readonly Workflow[]>(initialWorkflows);
  const [selectedName, setSelectedName] = useState<string | undefined>(initialWorkflows[0]?.name);
  const selected = workflows.find((w) => w.name === selectedName);

  const updateSelected = (next: Workflow) =>
    setWorkflows((prev) => prev.map((w) => (w.name === selectedName ? next : w)));

  const createWorkflow = () => {
    const name = `workflow_${workflows.length + 1}`;
    setWorkflows((prev) => [...prev, { name, commands: [] }]);
    setSelectedName(name);
  };

  return (
    <Stack direction="row" sx={{ gap: 4 }}>
      <Box sx={{ width: 260, flexShrink: 0 }}>
        <WorkflowList
          workflows={workflows}
          selectedName={selectedName}
          onSelect={setSelectedName}
          onCreate={createWorkflow}
        />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {selected ? (
          <Stack sx={{ gap: 2 }}>
            <WorkflowForm value={selected} onChange={updateSelected} schema={COMMAND_SCHEMA} />
            <Divider />
            <WorkflowView value={selected} schema={COMMAND_SCHEMA} />
          </Stack>
        ) : (
          <Typography color="text.secondary">No workflow selected</Typography>
        )}
      </Box>
    </Stack>
  );
}

const initialPredicate: PredicateExpression = {
  type: "and",
  exprs: [
    { type: "ref", name: "suitest_camera_connected" },
    {
      type: "or",
      exprs: [
        { type: "equals", name: "device_status", value: "online" },
        { type: "includes", name: "device_status", value: "recovering" },
      ],
    },
  ],
};

function PredicateExpressionDemo() {
  const [value, setValue] = useState<PredicateExpression>(initialPredicate);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <PredicateExpressionForm value={value} onChange={setValue} />
      <Divider />
      <PredicateExpressionView value={value} />
    </Stack>
  );
}

const initialPipeline: Pipeline = {
  type: "or",
  pipelines: [
    { type: "workflow", workflowName: "wake_and_check" },
    { type: "workflow", workflowName: "restart_app" },
  ],
};

function PipelineDemo() {
  const [value, setValue] = useState<Pipeline>(initialPipeline);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <PipelineForm value={value} onChange={setValue} />
      <Divider />
      <PipelineView value={value} />
    </Stack>
  );
}

const initialRecoveryPolicies: RecoveryPolicy[] = [
  {
    label: "adb_camera_recovery",
    domain: "adb",
    tripwires: [
      {
        grace: "30s" as DurationString,
        predicate: { type: "not", expr: { type: "ref", name: "suitest_camera_connected" } },
        pipeline: {
          type: "or",
          pipelines: [
            { type: "workflow", workflowName: "wake_and_check" },
            { type: "workflow", workflowName: "restart_app" },
          ],
        },
        retry: [
          ["exponentialBackoff", "1s"],
          ["capDelay", "30s"],
          ["limitRetries", 5],
        ],
        notify: [
          {
            type: { type: "slack" },
            channel: "#lab-alerts",
            message: { type: "template", message: "Camera {{entityId}} unreachable, retrying" },
            policy: ["exhausted"],
          },
        ],
      },
    ],
  },
];

function RecoveryDemo() {
  const [policies, setPolicies] = useState<readonly RecoveryPolicy[]>(initialRecoveryPolicies);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(initialRecoveryPolicies[0]?.label);
  const selected = policies.find((p) => p.label === selectedLabel);

  const updateSelected = (next: RecoveryPolicy) =>
    setPolicies((prev) => prev.map((p) => (p.label === selectedLabel ? next : p)));

  const createPolicy = () => {
    const label = `policy_${policies.length + 1}`;
    setPolicies((prev) => [...prev, { label, domain: "", tripwires: [] }]);
    setSelectedLabel(label);
  };

  return (
    <Stack direction="row" sx={{ gap: 4 }}>
      <Box sx={{ width: 260, flexShrink: 0 }}>
        <RecoveryPolicyList
          policies={policies}
          selectedLabel={selectedLabel}
          onSelect={setSelectedLabel}
          onCreate={createPolicy}
        />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {selected ? (
          <Stack sx={{ gap: 2 }}>
            <RecoveryPolicyForm
              value={selected}
              onChange={updateSelected}
              retrySchema={POLICY_STEP_SCHEMA}
              notifyTargetSchema={NOTIFY_TARGET_SCHEMA}
            />
            <Divider />
            <RecoveryPolicyView value={selected} />
          </Stack>
        ) : (
          <Typography color="text.secondary">No recovery policy selected</Typography>
        )}
      </Box>
    </Stack>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Stack sx={{ gap: 5, p: 4, maxWidth: 900 }}>
        <Section title="Duration">
          <DurationDemo />
        </Section>

        <Section title="Retry.Policy">
          <RetryPolicyDemo />
        </Section>

        <Section title="Workflow">
          <WorkflowDemo />
        </Section>

        <Section title="Predicate Expression">
          <PredicateExpressionDemo />
        </Section>

        <Section title="Pipeline">
          <PipelineDemo />
        </Section>

        <Section title="Recovery">
          <RecoveryDemo />
        </Section>

        <Divider />

        <Section title="Schedule (old, da rifare)">
          <UISchedule.Builder
            presets={[
              {
                name: "Eccezione giornaliera",
                description: "Tutti i giorni 9-18, escludi Lunedì, aggiungi Lun 18-19",
                steps: [
                  { label: "Tutti i giorni 9:00-18:00", schedule: Schedule.timeRange([9, 0], [18, 0]), op: "union" },
                  { label: "Lunedì", schedule: Schedule.day(0), op: "subtract" },
                  { label: "Lun 18:00-19:00", schedule: Schedule.block(0, [18, 0], [19, 0]), op: "union" },
                ],
              },
              {
                name: "Digital signage negozio",
                description: "Promo feriali 9-20, weekend 10-18, blackout pausa pranzo",
                steps: [
                  { label: "Feriali 9:00-20:00", schedule: Schedule.weekdays([9, 0], [20, 0]), op: "union" },
                  { label: "Weekend 10:00-18:00", schedule: Schedule.weekend([10, 0], [18, 0]), op: "union" },
                  { label: "Pausa pranzo 13:00-14:00", schedule: Schedule.timeRange([13, 0], [14, 0]), op: "subtract" },
                ],
              },
              {
                name: "Palinsesto TV",
                description: "TG mattina e sera + spot ricorrenti in fascia diurna",
                steps: [
                  { label: "TG Mattina 7:00-7:30", schedule: Schedule.duration([7, 0], 30), op: "union" },
                  { label: "TG Sera 20:00-20:30", schedule: Schedule.duration([20, 0], 30), op: "union" },
                  { label: "Spot 2min ogni 20min", schedule: Schedule.recurring(20, 2), op: "union" },
                  {
                    label: "Solo fascia 6:00-23:00",
                    schedule: Schedule.timeRange([6, 0], [23, 0]),
                    op: "intersection",
                  },
                ],
              },
              {
                name: "Supporto clienti",
                description: "Lun-Ven 8-18, Sab mattina, mai Domenica",
                steps: [
                  { label: "Feriali 8:00-18:00", schedule: Schedule.weekdays([8, 0], [18, 0]), op: "union" },
                  { label: "Sab 9:00-13:00", schedule: Schedule.block(5, [9, 0], [13, 0]), op: "union" },
                ],
              },
              {
                name: "Manutenzione notturna",
                description: "Sempre attivo h24, escludi finestra manutenzione 2-5 AM",
                steps: [
                  { label: "Sempre attivo", schedule: Schedule.always, op: "union" },
                  { label: "Manutenzione 2:00-5:00", schedule: Schedule.timeRange([2, 0], [5, 0]), op: "subtract" },
                  { label: "Niente weekend", schedule: Schedule.weekend([0, 0], [23, 59]), op: "subtract" },
                ],
              },
              {
                name: "Ristorante",
                description: "Pranzo e cena, chiuso Martedì, brunch domenicale",
                steps: [
                  { label: "Pranzo 12:00-14:30", schedule: Schedule.timeRange([12, 0], [14, 30]), op: "union" },
                  { label: "Cena 19:00-23:00", schedule: Schedule.timeRange([19, 0], [23, 0]), op: "union" },
                  { label: "Chiuso Martedì", schedule: Schedule.day(1), op: "subtract" },
                  { label: "Brunch Dom 10:00-14:00", schedule: Schedule.block(6, [10, 0], [14, 0]), op: "union" },
                ],
              },
            ]}
          />
        </Section>
      </Stack>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
