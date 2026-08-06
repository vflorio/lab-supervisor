import type { Meta, StoryObj } from "@storybook/react";
import { COMMAND_SCHEMA } from "@supervisor/core/workflow/codec";
import { WORKFLOW_TEMPLATES } from "@supervisor/core/workflow/templates";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { useState } from "react";
import { WorkflowForm } from "./WorkflowForm";

const meta: Meta<typeof WorkflowForm> = {
  title: "Workflow/WorkflowForm",
  component: WorkflowForm,
};

export default meta;
type Story = StoryObj<typeof WorkflowForm>;

export const Default: Story = {
  args: {
    value: {
      name: "wake_and_check",
      commands: [{ type: "wakeUp" }, { type: "waitForDevice" }],
    } as Workflow,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Workflow>(args.value);
    return <WorkflowForm {...args} value={value} onChange={setValue} />;
  },
};

export const Empty: Story = {
  args: {
    value: {
      name: "new_workflow",
      commands: [],
    } as Workflow,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Workflow>(args.value);
    return <WorkflowForm {...args} value={value} onChange={setValue} />;
  },
};

// Le storie sotto partono dalla libreria di riferimento in @supervisor/core/workflow/templates -
// gli stessi workflow che il futuro workflow builder proporrà come punto di partenza - e mostrano
// come i Command si compongono: await/when su Condition (fatti + probe, and/or/not), run per
// nidificare workflow più piccoli.

export const ConditionalBranch: Story = {
  name: "Composition: when with Condition (and/not)",
  args: {
    value: WORKFLOW_TEMPLATES.find((t) => t.label === "Diramazione condizionale")!.workflow,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Workflow>(args.value);
    return <WorkflowForm {...args} value={value} onChange={setValue} />;
  },
};

export const AwaitMixedCondition: Story = {
  name: "Composition: await with mixed Condition (fact + probe in or)",
  args: {
    value: WORKFLOW_TEMPLATES.find((t) => t.label === "Attesa su condizione mista")!.workflow,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Workflow>(args.value);
    return <WorkflowForm {...args} value={value} onChange={setValue} />;
  },
};

export const NestedRun: Story = {
  name: "Composition: run (nested workflow)",
  args: {
    value: WORKFLOW_TEMPLATES.find((t) => t.label === "Composizione nidificata")!.workflow,
    schema: COMMAND_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Workflow>(args.value);
    return <WorkflowForm {...args} value={value} onChange={setValue} />;
  },
};
