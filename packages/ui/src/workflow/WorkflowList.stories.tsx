import type { Meta, StoryObj } from "@storybook/react";
import { COMMAND_SCHEMA, type Workflow } from "@supervisor/core/workflow/codec";
import { WORKFLOW_TEMPLATES } from "@supervisor/core/workflow/templates";
import { useState } from "react";
import { WorkflowList } from "./WorkflowList";

const meta: Meta<typeof WorkflowList> = {
  title: "Workflow/WorkflowList",
  component: WorkflowList,
};

export default meta;
type Story = StoryObj<typeof WorkflowList>;

const initialWorkflows: readonly Workflow[] = [
  {
    name: "wake_and_check",
    commands: [
      { type: "wakeUp" },
      { type: "waitForDevice" },
      { type: "sleep", duration: "2s" },
      { type: "ensureActivity", packageId: "com.example.app", activity: ".MainActivity" },
    ],
  },
  {
    name: "restart_app",
    commands: [
      { type: "restartApp", packageId: "com.example.app" },
      {
        type: "await",
        condition: { type: "leaf", leaf: { type: "probe", name: "activityResumed", args: [".MainActivity"] } },
        timeout: "30s",
      },
    ],
  },
];

export const Editing: Story = {
  args: {
    workflows: initialWorkflows,
    editing: true,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    const [workflows, setWorkflows] = useState<readonly Workflow[]>(args.workflows);

    const updateWorkflow = (next: Workflow) =>
      setWorkflows((prev) => prev.map((w) => (w.name === next.name ? next : w)));

    const createWorkflow = () => {
      const name = `workflow_${workflows.length + 1}`;
      setWorkflows((prev) => [...prev, { name, commands: [] }]);
    };

    return <WorkflowList {...args} workflows={workflows} onChange={updateWorkflow} onCreate={createWorkflow} />;
  },
};

export const ReadOnly: Story = {
  args: {
    workflows: initialWorkflows,
    editing: false,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    return <WorkflowList {...args} onChange={() => {}} />;
  },
};

export const Empty: Story = {
  args: {
    workflows: [],
    editing: false,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    return <WorkflowList {...args} onChange={() => {}} />;
  },
};

// L'intera libreria di riferimento in @supervisor/core/workflow/templates, vista come lista:
// il ventaglio completo di composizioni di Command che il futuro workflow builder proporrà
// come punto di partenza (sequenze piatte, await/when su Condition, run nidificato).
const templateWorkflows: readonly Workflow[] = WORKFLOW_TEMPLATES.map((t) => t.workflow);

export const TemplateLibrary: Story = {
  args: {
    workflows: templateWorkflows,
    editing: false,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    return <WorkflowList {...args} onChange={() => {}} />;
  },
};
