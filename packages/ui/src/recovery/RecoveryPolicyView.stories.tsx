import type { Meta, StoryObj } from "@storybook/react";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { RecoveryPolicyView } from "./RecoveryPolicyView";

const meta: Meta<typeof RecoveryPolicyView> = {
  title: "Recovery/RecoveryPolicyView",
  component: RecoveryPolicyView,
};

export default meta;
type Story = StoryObj<typeof RecoveryPolicyView>;

const policyWithTripwire: RecoveryPolicy = {
  label: "adb_camera_recovery",
  domain: "adb",
  tripwires: [
    {
      grace: "30s",
      predicate: { type: "not", expr: { type: "ref", name: "suitest_camera_connected" } },
      pipeline: { type: "workflow", workflowName: "wake_and_check" },
      retry: [
        ["exponentialBackoff", "1s"],
        ["capDelay", "30s"],
        ["limitRetries", 5],
      ],
      notify: [],
    },
  ],
};

const emptyPolicy: RecoveryPolicy = {
  label: "empty_policy",
  domain: "test",
  tripwires: [],
};

export const WithTripwire: Story = {
  args: {
    value: policyWithTripwire,
  },
};

export const Empty: Story = {
  args: {
    value: emptyPolicy,
  },
};
