import type { Meta, StoryObj } from "@storybook/react";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { PipelineView } from "./PipelineView";

const meta: Meta<typeof PipelineView> = {
  title: "Pipeline/PipelineView",
  component: PipelineView,
};

export default meta;
type Story = StoryObj<typeof PipelineView>;

const orPipeline: Pipeline = {
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
    value: orPipeline,
  },
};

export const Nested: Story = {
  args: {
    value: nestedPipeline,
  },
};
