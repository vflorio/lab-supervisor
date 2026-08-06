import type { Meta, StoryObj } from "@storybook/react";
import type { Pipeline } from "@supervisor/core/workflow/pipeline";
import { PIPELINE_TEMPLATES } from "@supervisor/core/workflow/pipeline-templates";
import { useState } from "react";
import { PipelineForm } from "./PipelineForm";

const meta: Meta<typeof PipelineForm> = {
  title: "Pipeline/PipelineForm",
  component: PipelineForm,
};

export default meta;
type Story = StoryObj<typeof PipelineForm>;

const workflowNames = ["wake_and_check", "restart_app", "full_recovery", "await_stable_connection"];

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

// Le storie sotto partono dalla libreria di riferimento in
// @supervisor/core/workflow/pipeline-templates - la stessa che il futuro pipeline builder
// userà come punto di partenza - e mostrano la semantica di and/or/not/condition: or come
// escalation (non un retry dello stesso livello), condition come gate senza esecuzione, not come
// inversione dell'intero esito di un pipeline.

export const ConditionGate: Story = {
  name: "Composition: condition as gate (and)",
  args: {
    value: PIPELINE_TEMPLATES.find((t) => t.label === "Precondizione con gate")!.pipeline,
    workflowNames,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Pipeline>(args.value);
    return <PipelineForm {...args} value={value} onChange={setValue} />;
  },
};

export const ThreeLevelEscalation: Story = {
  name: "Composition: three-level escalation (or)",
  args: {
    value: PIPELINE_TEMPLATES.find((t) => t.label === "Scala di recovery a tre livelli")!.pipeline,
    workflowNames,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Pipeline>(args.value);
    return <PipelineForm {...args} value={value} onChange={setValue} />;
  },
};

export const InvertedFallback: Story = {
  name: "Composition: not (run only if the other fails)",
  args: {
    value: PIPELINE_TEMPLATES.find((t) => t.label === "Esegui solo se l'altro non ce l'ha fatta")!.pipeline,
    workflowNames,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Pipeline>(args.value);
    return <PipelineForm {...args} value={value} onChange={setValue} />;
  },
};
