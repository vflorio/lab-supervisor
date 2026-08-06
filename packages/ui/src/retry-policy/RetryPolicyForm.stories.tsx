import type { Meta, StoryObj } from "@storybook/react";
import { POLICY_STEP_SCHEMA, type PolicyJson } from "@supervisor/core/retry/codec";
import { useState } from "react";
import { RetryPolicyForm } from "./RetryPolicyForm";

const meta: Meta<typeof RetryPolicyForm> = {
  title: "Retry-Policy/RetryPolicyForm",
  component: RetryPolicyForm,
};

export default meta;
type Story = StoryObj<typeof RetryPolicyForm>;

export const Default: Story = {
  args: {
    value: [
      ["exponentialBackoff", "100ms"],
      ["capDelay", "5s"],
      ["limitRetries", 10],
    ] as PolicyJson,
    schema: POLICY_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<PolicyJson>(args.value);
    return <RetryPolicyForm {...args} value={value} onChange={setValue} />;
  },
};

export const Empty: Story = {
  args: {
    value: [] as PolicyJson,
    schema: POLICY_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<PolicyJson>(args.value);
    return <RetryPolicyForm {...args} value={value} onChange={setValue} />;
  },
};
