import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FactLeafForm } from "./FactLeafForm";
import type { FactOption } from "./FactRefPicker";
import type { FactLeaf } from "./ops";

const meta: Meta<typeof FactLeafForm> = {
  title: "Predicates/FactLeafForm",
  component: FactLeafForm,
};

export default meta;
type Story = StoryObj<typeof FactLeafForm>;

const mockFactOptions: readonly FactOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
];

export const Ref: Story = {
  args: {
    value: { type: "truthy", name: "suitest_camera_connected" } as FactLeaf,
    factOptions: mockFactOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<FactLeaf>(args.value);
    return <FactLeafForm {...args} value={value} onChange={setValue} />;
  },
};

export const Equals: Story = {
  args: {
    value: { type: "equals", name: "device_status", value: "online" } as FactLeaf,
    factOptions: mockFactOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<FactLeaf>(args.value);
    return <FactLeafForm {...args} value={value} onChange={setValue} />;
  },
};
