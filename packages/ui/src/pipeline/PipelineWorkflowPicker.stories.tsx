import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PipelineWorkflowPicker } from "./PipelineWorkflowPicker";

const meta: Meta<typeof PipelineWorkflowPicker> = {
  title: "Pipeline/PipelineWorkflowPicker",
  component: PipelineWorkflowPicker,
};

export default meta;
type Story = StoryObj<typeof PipelineWorkflowPicker>;

const workflowNames = ["wake_and_check", "restart_app", "full_recovery", "check_connectivity"];

export const Default: Story = {
  args: {
    workflowNames,
    selected: ["wake_and_check"],
    op: "or",
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<readonly string[]>(args.selected);
    const [op, setOp] = useState<"or" | "and">(args.op);

    return (
      <PipelineWorkflowPicker
        {...args}
        selected={selected}
        onToggle={(name) => {
          setSelected((prev) =>
            prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
          );
        }}
        op={op}
        onOpChange={setOp}
      />
    );
  },
};

export const Multiple: Story = {
  args: {
    workflowNames,
    selected: ["wake_and_check", "restart_app"],
    op: "and",
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<readonly string[]>(args.selected);
    const [op, setOp] = useState<"or" | "and">(args.op);

    return (
      <PipelineWorkflowPicker
        {...args}
        selected={selected}
        onToggle={(name) => {
          setSelected((prev) =>
            prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
          );
        }}
        op={op}
        onOpChange={setOp}
      />
    );
  },
};
