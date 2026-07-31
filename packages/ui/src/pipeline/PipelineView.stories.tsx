import type { Meta, StoryObj } from "@storybook/react";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { PIPELINE_TEMPLATES } from "@supervisor/core/workflow/pipeline-templates";
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

// Stessa libreria di riferimento usata da PipelineForm.stories, in sola lettura.

export const ConditionGate: Story = {
  name: "Composition: condition as gate (and)",
  args: {
    value: PIPELINE_TEMPLATES.find((t) => t.label === "Precondizione con gate")!.pipeline,
  },
};

export const ThreeLevelEscalation: Story = {
  name: "Composition: three-level escalation (or)",
  args: {
    value: PIPELINE_TEMPLATES.find((t) => t.label === "Scala di recovery a tre livelli")!.pipeline,
  },
};

export const InvertedFallback: Story = {
  name: "Composition: not (run only if the other fails)",
  args: {
    value: PIPELINE_TEMPLATES.find((t) => t.label === "Esegui solo se l'altro non ce l'ha fatta")!.pipeline,
  },
};
