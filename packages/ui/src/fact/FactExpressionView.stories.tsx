import type { Meta, StoryObj } from "@storybook/react";
import type { Condition } from "@supervisor/core/fact/condition";
import { FactExpressionView } from "./FactExpressionView";

const meta: Meta<typeof FactExpressionView> = {
  title: "Predicates/FactExpressionView",
  component: FactExpressionView,
};

export default meta;
type Story = StoryObj<typeof FactExpressionView>;

const complexCondition: Condition = {
  type: "and",
  nodes: [
    { type: "leaf", leaf: { type: "truthy", name: "suitest_camera_connected" } },
    {
      type: "or",
      nodes: [
        { type: "leaf", leaf: { type: "equals", name: "device_status", value: "online" } },
        { type: "leaf", leaf: { type: "includes", name: "device_status", value: "recovering" } },
      ],
    },
  ],
};

const simpleRef: Condition = { type: "leaf", leaf: { type: "truthy", name: "suitest_camera_connected" } };

export const Default: Story = {
  args: {
    value: complexCondition,
  },
};

export const Simple: Story = {
  args: {
    value: simpleRef,
  },
};
