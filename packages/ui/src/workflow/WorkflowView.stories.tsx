import type { Meta, StoryObj } from "@storybook/react";
import { COMMAND_SCHEMA, type Workflow } from "@supervisor/core/workflow/codec";
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
