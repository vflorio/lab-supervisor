import type { Meta, StoryObj } from "@storybook/react";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import type { RecoveryTripwire } from "@supervisor/core/recovery/model";
import { RECOVERY_TRIPWIRE_TEMPLATES } from "@supervisor/core/recovery/templates";
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

// Le storie sotto partono dalla libreria di riferimento in @supervisor/core/recovery/templates -
// gli stessi tripwire che il futuro recovery builder proporrà come punto di partenza - e mostrano
// come predicate (and/not su fatti), pipeline (riferito da ../workflow/pipeline-templates) e
// notify si compongono in un singolo livello di recovery.

export const ComposedPredicateWithGate: Story = {
  name: "Composition: and/not predicate + escalating pipeline",
  args: {
    value: RECOVERY_TRIPWIRE_TEMPLATES.find((t) => t.label === "Predicate composto con gate di manutenzione")!.tripwire,
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app", "full_recovery"],
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RecoveryTripwire>(args.value);
    return <RecoveryTripwireForm {...args} value={value} onChange={setValue} />;
  },
};

export const NestedPipelineWithExhaustedNotify: Story = {
  name: "Composition: gated pipeline + exhausted notification",
  args: {
    value: RECOVERY_TRIPWIRE_TEMPLATES.find((t) => t.label === "Recovery con precondizione e notifica di esaurimento")!
      .tripwire,
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app", "full_recovery"],
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RecoveryTripwire>(args.value);
    return <RecoveryTripwireForm {...args} value={value} onChange={setValue} />;
  },
};
