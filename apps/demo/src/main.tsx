import { CssBaseline, Divider, Stack, ThemeProvider, Typography } from "@mui/material";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import type { DurationString } from "@supervisor/core/date-time";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { POLICY_STEP_SCHEMA, type PolicyJson } from "@supervisor/core/retry/codec";
import { SCHEDULE_STEP_SCHEMA, type ScheduleJson } from "@supervisor/core/schedule/codec";
import { COMMAND_SCHEMA } from "@supervisor/core/workflow/codec";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { ActivationScheduleForm, ActivationScheduleView } from "@supervisor/ui/activation-schedule";
import { DurationForm, DurationView } from "@supervisor/ui/duration";
import { PipelineForm, PipelineView } from "@supervisor/ui/pipeline";
import { PredicateExpressionForm, PredicateExpressionView, type PredicateOption } from "@supervisor/ui/predicates";
import { RecoveryPolicyList } from "@supervisor/ui/recovery";
import { RetryPolicyForm, RetryPolicyView } from "@supervisor/ui/retry-policy";
import { ScheduleForm, ScheduleView } from "@supervisor/ui/schedule";
import { WorkflowList } from "@supervisor/ui/workflow";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./retry";
import { theme } from "@supervisor/ui/theme";

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

const initialActivationSchedule: ActivationSchedule = {
  days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  from: "08:00",
  to: "20:00",
};

function ActivationScheduleDemo() {
  const [value, setValue] = useState<ActivationSchedule>(initialActivationSchedule);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <ActivationScheduleForm value={value} onChange={setValue} />
      <Divider />
      <ActivationScheduleView value={value} />
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

  const updateWorkflow = (next: Workflow) => setWorkflows((prev) => prev.map((w) => (w.name === next.name ? next : w)));

  const createWorkflow = () => {
    const name = `workflow_${workflows.length + 1}`;
    setWorkflows((prev) => [...prev, { name, commands: [] }]);
  };

  return (
    <Stack sx={{ gap: 2 }}>
      <WorkflowList
        workflows={workflows}
        editing
        schema={COMMAND_SCHEMA}
        onChange={updateWorkflow}
        onCreate={createWorkflow}
      />
      <Divider />
      <WorkflowList workflows={workflows} editing={false} schema={COMMAND_SCHEMA} onChange={() => {}} />
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
      <PredicateExpressionForm value={value} onChange={setValue} predicateOptions={mockPredicateOptions} />
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
  const workflowNames = initialWorkflows.map((w) => w.name);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <PipelineForm value={value} onChange={setValue} workflowNames={workflowNames} />
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

const mockPredicateOptions: PredicateOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
  { domain: "app", entityId: "tablet", name: "device_status" },
];

function RecoveryDemo() {
  const [policies, setPolicies] = useState<readonly RecoveryPolicy[]>(initialRecoveryPolicies);
  const workflowNames = initialWorkflows.map((w) => w.name);

  const updatePolicy = (next: RecoveryPolicy) =>
    setPolicies((prev) => prev.map((p) => (p.label === next.label ? next : p)));

  const createPolicy = () => {
    const label = `policy_${policies.length + 1}`;
    setPolicies((prev) => [...prev, { label, domain: "", tripwires: [] }]);
  };

  return (
    <Stack sx={{ gap: 2 }}>
      <RecoveryPolicyList
        policies={policies}
        editing
        retrySchema={POLICY_STEP_SCHEMA}
        notifyTargetSchema={NOTIFY_TARGET_SCHEMA}
        workflowNames={workflowNames}
        predicateOptions={mockPredicateOptions}
        onChange={updatePolicy}
        onCreate={createPolicy}
      />
      <Divider />
      <RecoveryPolicyList
        policies={policies}
        editing={false}
        retrySchema={POLICY_STEP_SCHEMA}
        notifyTargetSchema={NOTIFY_TARGET_SCHEMA}
        workflowNames={workflowNames}
        predicateOptions={mockPredicateOptions}
        onChange={() => {}}
      />
    </Stack>
  );
}

const initialSchedule: ScheduleJson = [
  ["union", ["weekdays", "09:00", "18:00"]],
  ["subtract", ["day", "monday"]],
  ["union", ["block", "monday", "18:00", "19:00"]],
];

function ScheduleDemo() {
  const [value, setValue] = useState<ScheduleJson>(initialSchedule);

  return (
    <Stack sx={{ gap: 1.5 }}>
      <ScheduleForm value={value} onChange={setValue} schema={SCHEDULE_STEP_SCHEMA} />
      <Divider />
      <ScheduleView value={value} />
    </Stack>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Stack sx={{ gap: 5, p: 4, maxWidth: 900 }}>
        <Section title="Activation Schedule">
          <ActivationScheduleDemo />
        </Section>

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

        <Section title="Schedule">
          <ScheduleDemo />
        </Section>
      </Stack>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
