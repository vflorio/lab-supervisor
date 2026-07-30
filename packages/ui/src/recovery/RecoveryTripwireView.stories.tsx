import type { Meta, StoryObj } from "@storybook/react";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { RecoveryTripwireView } from "./RecoveryTripwireView";

const meta: Meta<typeof RecoveryTripwireView> = {
  title: "Recovery/RecoveryTripwireView",
  component: RecoveryTripwireView,
};

export default meta;
type Story = StoryObj<typeof RecoveryTripwireView>;

export const Default: Story = {
  args: {
    value: {
      grace: "30s",
      predicate: { type: "ref", name: "suitest_camera_connected" },
      pipeline: { type: "workflow", workflowName: "wake_and_check" },
      retry: [
        ["exponentialBackoff", "1s"],
        ["capDelay", "30s"],
        ["limitRetries", 5],
      ],
      notify: [],
    } as RecoveryTripwire,
  },
};
