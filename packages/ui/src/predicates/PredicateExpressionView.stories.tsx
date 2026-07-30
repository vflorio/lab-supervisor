import type { Meta, StoryObj } from "@storybook/react";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import { PredicateExpressionView } from "./PredicateExpressionView";

const meta: Meta<typeof PredicateExpressionView> = {
  title: "Predicates/PredicateExpressionView",
  component: PredicateExpressionView,
};

export default meta;
type Story = StoryObj<typeof PredicateExpressionView>;

const complexPredicate: PredicateExpression = {
  type: "and",
  exprs: [
    { type: "ref", name: "suitest_camera_connected" },
    {
      type: "or",
      exprs: [
        { type: "equals", name: "device_status", value: "online" },
        { type: "includes", name: "device_status", value: "recovering" },
      ],
    },
  ],
};

const simpleRef: PredicateExpression = { type: "ref", name: "suitest_camera_connected" };

export const Default: Story = {
  args: {
    value: complexPredicate,
  },
};

export const Simple: Story = {
  args: {
    value: simpleRef,
  },
};
