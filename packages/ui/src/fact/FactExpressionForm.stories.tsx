import type { Meta, StoryObj } from "@storybook/react";
import type { Condition } from "@supervisor/core/fact/condition";
import { useState } from "react";
import { FactExpressionForm } from "./FactExpressionForm";
import type { FactOption } from "./FactRefPicker";

const meta: Meta<typeof FactExpressionForm> = {
  title: "Predicates/FactExpressionForm",
  component: FactExpressionForm,
};

export default meta;
type Story = StoryObj<typeof FactExpressionForm>;

const mockFactOptions: readonly FactOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
  { domain: "app", entityId: "tablet", name: "device_status" },
];

const initialCondition: Condition = {
  type: "and",
  nodes: [
    { type: "leaf", leaf: { type: "ref", name: "suitest_camera_connected" } },
    {
      type: "or",
      nodes: [
        { type: "leaf", leaf: { type: "equals", name: "device_status", value: "online" } },
        { type: "leaf", leaf: { type: "includes", name: "device_status", value: "recovering" } },
      ],
    },
  ],
};

export const Default: Story = {
  args: {
    value: initialCondition,
    factOptions: mockFactOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Condition>(args.value);
    return <FactExpressionForm {...args} value={value} onChange={setValue} />;
  },
};

export const Simple: Story = {
  args: {
    value: { type: "leaf", leaf: { type: "ref", name: "suitest_camera_connected" } } as Condition,
    factOptions: mockFactOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Condition>(args.value);
    return <FactExpressionForm {...args} value={value} onChange={setValue} />;
  },
};
