import type { Meta, StoryObj } from "@storybook/react";
import type { NotifyRule } from "@supervisor/core/notify/codec";
import { NotifyRuleView } from "./NotifyRuleView";

const meta: Meta<typeof NotifyRuleView> = {
  title: "Notify/NotifyRuleView",
  component: NotifyRuleView,
};

export default meta;
type Story = StoryObj<typeof NotifyRuleView>;

export const Default: Story = {
  args: {
    value: {
      type: { type: "slack" },
      channel: "alerts",
      message: { type: "simple", text: "Alert message" },
      policy: ["immediate"],
    } as NotifyRule,
  },
};

export const WithExhausted: Story = {
  args: {
    value: {
      type: { type: "slack" },
      channel: "alerts",
      message: { type: "simple", text: "Alert message" },
      policy: ["immediate", "exhausted"],
    } as NotifyRule,
  },
};
