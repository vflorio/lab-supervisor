import type { Meta, StoryObj } from "@storybook/react";
import { LoopWidget } from "./LoopWidget";

const meta: Meta<typeof LoopWidget> = {
  title: "TaskRunner/LoopWidget",
  component: LoopWidget,
};

export default meta;
type Story = StoryObj<typeof LoopWidget>;

const NOW = 1_700_000_000_000;

export const Running: Story = {
  args: {
    id: "android-bridge:reconcile",
    label: "AndroidBridge reconcile",
    state: "running",
    iteration: 842,
    lastTickAt: NOW - 3_100,
    nextTickAt: NOW + 1_900,
    delayMs: 5_000,
    policyLabel: "constant 5s",
    detail: "reconciled 3 cameras",
    now: NOW,
  },
};

export const Idle: Story = {
  args: {
    id: "tracker:suitest-device",
    label: "Suitest - devices",
    state: "idle",
    iteration: 0,
    policyLabel: "constant 30s",
    now: NOW,
  },
};

export const Exhausted: Story = {
  args: {
    id: "recovery:adb-camera",
    label: "Recovery - adb-camera",
    state: "exhausted",
    iteration: 12,
    lastTickAt: NOW - 120_000,
    policyLabel: "exp 1s → cap 30s",
    detail: "tripwire adb_camera_recovery exhausted",
    now: NOW,
  },
};

export const Overdue: Story = {
  args: {
    id: "tracker:adb",
    label: "ADB tracking",
    state: "error",
    iteration: 1203,
    lastTickAt: NOW - 45_000,
    nextTickAt: NOW - 5_000,
    delayMs: 20_000,
    policyLabel: "constant 20s",
    detail: "last tick failed: ECONNREFUSED",
    now: NOW,
  },
};
