import type { Meta, StoryObj } from "@storybook/react";
import type { PredicateExpression } from "@supervisor/core/predicates/expression";
import { useState } from "react";
import { PredicateExpressionForm } from "./PredicateExpressionForm";
import type { PredicateOption } from "./PredicateRefPicker";

const meta: Meta<typeof PredicateExpressionForm> = {
  title: "Predicates/PredicateExpressionForm",
  component: PredicateExpressionForm,
};

export default meta;
type Story = StoryObj<typeof PredicateExpressionForm>;

const mockPredicateOptions: readonly PredicateOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
  { domain: "app", entityId: "tablet", name: "device_status" },
];

const initialPredicate: PredicateExpression = {
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

export const Default: Story = {
  args: {
    value: initialPredicate,
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<PredicateExpression>(args.value);
    return <PredicateExpressionForm {...args} value={value} onChange={setValue} />;
  },
};

export const Simple: Story = {
  args: {
    value: { type: "ref", name: "suitest_camera_connected" } as PredicateExpression,
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<PredicateExpression>(args.value);
    return <PredicateExpressionForm {...args} value={value} onChange={setValue} />;
  },
};
