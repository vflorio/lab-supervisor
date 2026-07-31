import type { Meta, StoryObj } from "@storybook/react";
import { COMMAND_SCHEMA, type Workflow } from "@supervisor/core/workflow/codec";
import { WORKFLOW_TEMPLATES } from "@supervisor/core/workflow/templates";
import { WorkflowView } from "./WorkflowView";

const meta: Meta<typeof WorkflowView> = {
  title: "Workflow/WorkflowView",
  component: WorkflowView,
};

export default meta;
type Story = StoryObj<typeof WorkflowView>;

export const Default: Story = {
  args: {
    value: {
      name: "wake_and_check",
      commands: [{ type: "wakeUp" }, { type: "waitForDevice" }, { type: "sleep", duration: "2s" }],
    } as Workflow,
    schema: COMMAND_SCHEMA,
  },
};

export const Empty: Story = {
  args: {
    value: {
      name: "empty_workflow",
      commands: [],
    } as Workflow,
    schema: COMMAND_SCHEMA,
  },
};

// Stessa libreria di riferimento usata da WorkflowForm.stories, in sola lettura.

export const ConditionalBranch: Story = {
  name: "Composition: when with Condition (and/not)",
  args: {
    value: WORKFLOW_TEMPLATES.find((t) => t.label === "Diramazione condizionale")!.workflow,
    schema: COMMAND_SCHEMA,
  },
};

export const AwaitMixedCondition: Story = {
  name: "Composition: await with mixed Condition (fact + probe in or)",
  args: {
    value: WORKFLOW_TEMPLATES.find((t) => t.label === "Attesa su condizione mista")!.workflow,
    schema: COMMAND_SCHEMA,
  },
};

export const NestedRun: Story = {
  name: "Composition: run (nested workflow)",
  args: {
    value: WORKFLOW_TEMPLATES.find((t) => t.label === "Composizione nidificata")!.workflow,
    schema: COMMAND_SCHEMA,
  },
};
