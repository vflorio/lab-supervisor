import type { Meta, StoryObj } from "@storybook/react";
import type { PolicyJson } from "@supervisor/core/retry/codec";
import { RetryPolicyView } from "./RetryPolicyView";

const meta: Meta<typeof RetryPolicyView> = {
  title: "Retry-Policy/RetryPolicyView",
  component: RetryPolicyView,
};

export default meta;
type Story = StoryObj<typeof RetryPolicyView>;

export const Default: Story = {
  args: {
    value: [
      ["exponentialBackoff", "100ms"],
      ["capDelay", "5s"],
      ["limitRetries", 10],
    ] as PolicyJson,
  },
};

export const Empty: Story = {
  args: {
    value: [] as PolicyJson,
  },
};
