import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { PredicateLeaf } from "./ops";
import type { PredicateOption } from "./PredicateRefPicker";
import { PredicateLeafForm } from "./PredicateLeafForm";

const meta: Meta<typeof PredicateLeafForm> = {
  title: "Predicates/PredicateLeafForm",
  component: PredicateLeafForm,
};

export default meta;
type Story = StoryObj<typeof PredicateLeafForm>;

const mockPredicateOptions: readonly PredicateOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
];

export const Ref: Story = {
  args: {
    value: { type: "ref", name: "suitest_camera_connected" } as PredicateLeaf,
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<PredicateLeaf>(args.value);
    return <PredicateLeafForm {...args} value={value} onChange={setValue} />;
  },
};

export const Equals: Story = {
  args: {
    value: { type: "equals", name: "device_status", value: "online" } as PredicateLeaf,
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<PredicateLeaf>(args.value);
    return <PredicateLeafForm {...args} value={value} onChange={setValue} />;
  },
};
