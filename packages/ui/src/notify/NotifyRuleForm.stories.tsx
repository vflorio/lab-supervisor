import type { Meta, StoryObj } from "@storybook/react";
import { NOTIFY_TARGET_SCHEMA, type NotifyRule } from "@supervisor/core/notify/codec";
import { useState } from "react";
import { NotifyRuleForm } from "./NotifyRuleForm";

const meta: Meta<typeof NotifyRuleForm> = {
  title: "Notify/NotifyRuleForm",
  component: NotifyRuleForm,
};

export default meta;
type Story = StoryObj<typeof NotifyRuleForm>;

export const Default: Story = {
  args: {
    value: {
      type: { type: "slack" },
      channel: "alerts",
      message: { type: "simple", text: "Alert message" },
      policy: ["immediate"],
    } as NotifyRule,
    targetSchema: NOTIFY_TARGET_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<NotifyRule>(args.value);
    return <NotifyRuleForm {...args} value={value} onChange={setValue} />;
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
    targetSchema: NOTIFY_TARGET_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<NotifyRule>(args.value);
    return <NotifyRuleForm {...args} value={value} onChange={setValue} />;
  },
};
