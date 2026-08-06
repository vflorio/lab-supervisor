import type { Meta, StoryObj } from "@storybook/react";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import { POLICY_STEP_SCHEMA } from "@supervisor/core/retry/codec";
import { useState } from "react";
import type { FactOption } from "../fact/FactRefPicker";
import { TripwireWizard } from "./TripwireWizard";

const meta: Meta<typeof TripwireWizard> = {
  title: "Recovery/TripwireWizard",
  component: TripwireWizard,
};

export default meta;
type Story = StoryObj<typeof TripwireWizard>;

const mockFactOptions: readonly FactOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
  { domain: "app", entityId: "tablet", name: "device_status" },
];

export const Default: Story = {
  args: {
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app", "full_recovery"],
    factOptions: mockFactOptions,
  },
  render: function Render(args) {
    const [open, setOpen] = useState(true);
    return (
      <TripwireWizard
        {...args}
        open={open}
        onClose={() => setOpen(false)}
        onComplete={(tripwire) => {
          console.log("Tripwire created:", tripwire);
          setOpen(false);
        }}
      />
    );
  },
};
