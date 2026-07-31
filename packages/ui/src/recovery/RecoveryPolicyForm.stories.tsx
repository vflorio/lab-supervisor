import type { Meta, StoryObj } from "@storybook/react";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { RECOVERY_POLICY_TEMPLATES } from "@supervisor/core/recovery/templates";
import { POLICY_STEP_SCHEMA } from "@supervisor/core/retry/codec";
import { useState } from "react";
import type { PredicateOption } from "../predicates/PredicateRefPicker";
import { RecoveryPolicyForm } from "./RecoveryPolicyForm";

const meta: Meta<typeof RecoveryPolicyForm> = {
  title: "Recovery/RecoveryPolicyForm",
  component: RecoveryPolicyForm,
};

export default meta;
type Story = StoryObj<typeof RecoveryPolicyForm>;

const mockPredicateOptions: readonly PredicateOption[] = [
  { domain: "suitest-camera", entityId: "tablet", name: "suitest_camera_connected" },
  { domain: "adb", entityId: "192.168.1.4:5555", name: "adb_device_online" },
  { domain: "app", entityId: "tablet", name: "device_status" },
];

const initialPolicy: RecoveryPolicy = {
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
  label: "new_policy",
  domain: "",
  tripwires: [],
};

export const Default: Story = {
  args: {
    value: initialPolicy,
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app", "full_recovery"],
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RecoveryPolicy>(args.value);
    return <RecoveryPolicyForm {...args} value={value} onChange={setValue} />;
  },
};

// Libreria di riferimento in @supervisor/core/recovery/templates: un'intera policy con tre
// tripwire ordinati per grace crescente, dallo scatto più leggero (semplice risveglio) fino al
// recovery completo con notifica di esaurimento - la scala di escalation, non un retry ripetuto
// dello stesso livello.
export const ThreeLevelEscalationPolicy: Story = {
  name: "Composition: three-tripwire escalation ladder",
  args: {
    value: RECOVERY_POLICY_TEMPLATES.find((t) => t.label === "Escalation a tre livelli")!.policy,
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app", "full_recovery"],
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RecoveryPolicy>(args.value);
    return <RecoveryPolicyForm {...args} value={value} onChange={setValue} />;
  },
};

export const Empty: Story = {
  args: {
    value: emptyPolicy,
    retrySchema: POLICY_STEP_SCHEMA,
    notifyTargetSchema: NOTIFY_TARGET_SCHEMA,
    workflowNames: ["wake_and_check", "restart_app", "full_recovery"],
    predicateOptions: mockPredicateOptions,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RecoveryPolicy>(args.value);
    return <RecoveryPolicyForm {...args} value={value} onChange={setValue} />;
  },
};
