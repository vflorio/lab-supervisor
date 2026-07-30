import type { Meta, StoryObj } from "@storybook/react";
import { COMMAND_SCHEMA } from "@supervisor/core/workflow/codec";
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
