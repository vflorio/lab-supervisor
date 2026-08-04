import type { Meta, StoryObj } from "@storybook/react";
import { FactLeafView } from "./FactLeafView";
import type { FactLeaf } from "./ops";

const meta: Meta<typeof FactLeafView> = {
  title: "Predicates/FactLeafView",
  component: FactLeafView,
};

export default meta;
type Story = StoryObj<typeof FactLeafView>;

export const Ref: Story = {
  args: {
    value: { type: "ref", name: "suitest_camera_connected" } as FactLeaf,
  },
};

export const Equals: Story = {
  args: {
    value: { type: "equals", name: "device_status", value: "online" } as FactLeaf,
  },
};

export const Includes: Story = {
  args: {
    value: { type: "includes", name: "device_status", value: "recovering" } as FactLeaf,
  },
};
