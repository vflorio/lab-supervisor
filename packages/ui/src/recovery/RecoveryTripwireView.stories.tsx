import type { Meta, StoryObj } from "@storybook/react";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { RECOVERY_TRIPWIRE_TEMPLATES } from "@supervisor/core/recovery/templates";
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

// Stessa libreria di riferimento usata da RecoveryTripwireForm.stories, in sola lettura.

export const ComposedPredicateWithGate: Story = {
  name: "Composition: and/not predicate + escalating pipeline",
  args: {
    value: RECOVERY_TRIPWIRE_TEMPLATES.find((t) => t.label === "Predicate composto con gate di manutenzione")!.tripwire,
  },
};

export const NestedPipelineWithExhaustedNotify: Story = {
  name: "Composition: gated pipeline + exhausted notification",
  args: {
    value: RECOVERY_TRIPWIRE_TEMPLATES.find((t) => t.label === "Recovery con precondizione e notifica di esaurimento")!
      .tripwire,
  },
};
