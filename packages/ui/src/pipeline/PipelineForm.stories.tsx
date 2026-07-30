import type { Meta, StoryObj } from "@storybook/react";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { useState } from "react";
import { PipelineForm } from "./PipelineForm";

const meta: Meta<typeof PipelineForm> = {
  title: "Pipeline/PipelineForm",
  component: PipelineForm,
};

export default meta;
type Story = StoryObj<typeof PipelineForm>;

const workflowNames = ["wake_and_check", "restart_app", "full_recovery"];

const initialPipeline: Pipeline = {
  type: "or",
  pipelines: [
    { type: "workflow", workflowName: "wake_and_check" },
    { type: "workflow", workflowName: "restart_app" },
  ],
};

const nestedPipeline: Pipeline = {
  type: "and",
  pipelines: [
    { type: "workflow", workflowName: "wake_and_check" },
    {
      type: "or",
      pipelines: [
        { type: "workflow", workflowName: "restart_app" },
        { type: "workflow", workflowName: "full_recovery" },
      ],
    },
  ],
};

export const Default: Story = {
  args: {
    value: initialPipeline,
    workflowNames,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Pipeline>(args.value);
    return <PipelineForm {...args} value={value} onChange={setValue} />;
  },
};

export const Nested: Story = {
  args: {
    value: nestedPipeline,
    workflowNames,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Pipeline>(args.value);
    return <PipelineForm {...args} value={value} onChange={setValue} />;
  },
};
