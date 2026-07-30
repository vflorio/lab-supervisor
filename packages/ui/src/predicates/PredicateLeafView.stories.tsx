import type { Meta, StoryObj } from "@storybook/react";
import type { PredicateLeaf } from "./ops";
import { PredicateLeafView } from "./PredicateLeafView";

const meta: Meta<typeof PredicateLeafView> = {
  title: "Predicates/PredicateLeafView",
  component: PredicateLeafView,
};

export default meta;
type Story = StoryObj<typeof PredicateLeafView>;

export const Ref: Story = {
  args: {
    value: { type: "ref", name: "suitest_camera_connected" } as PredicateLeaf,
  },
};

export const Equals: Story = {
  args: {
    value: { type: "equals", name: "device_status", value: "online" } as PredicateLeaf,
  },
};

export const Includes: Story = {
  args: {
    value: { type: "includes", name: "device_status", value: "recovering" } as PredicateLeaf,
  },
};
