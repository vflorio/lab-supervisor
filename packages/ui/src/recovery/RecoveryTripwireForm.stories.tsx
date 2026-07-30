import type { Meta, StoryObj } from "@storybook/react";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { POLICY_STEP_SCHEMA } from "@supervisor/core/retry/codec";
import { useState } from "react";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { RecoveryTripwireForm } from "./RecoveryTripwireForm";

const meta: Meta<typeof RecoveryTripwireForm> = {
  title: "Recovery/RecoveryTripwireForm",
  component: RecoveryTripwireForm,
};

export default meta;
type Story = StoryObj<typeof RecoveryTripwireForm>;

const mockPredicateOptions: readonly PredicateOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
];

export const Default: Story = {
  args: {
    value: {
      grace: "30s",
      predicate: { type: "ref", name: "suitest_camera_connected" },
      pipeline: { type: "workflow", workflowName: "wake_and_check" },
      retry: [["exponentialBackoff", "1s"]],
      notify: [],
    } as RecoveryTripwire,
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app"],
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RecoveryTripwire>(args.value);
    return <RecoveryTripwireForm {...args} value={value} onChange={setValue} />;
  },
};
