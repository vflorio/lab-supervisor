import type { Meta, StoryObj } from "@storybook/react";
import { ServiceStrip, type ServiceStripProps } from "./ServiceStrip";

const meta: Meta<typeof ServiceStrip> = {
  title: "TaskRunner/ServiceStrip",
  component: ServiceStrip,
};

export default meta;
type Story = StoryObj<typeof ServiceStrip>;

const NOW = 1_700_000_000_000;

const ONLINE_ARGS: ServiceStripProps = {
  connection: "online",
  loops: [
    {
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
    {
      id: "tracker:adb",
      label: "ADB tracking",
      state: "running",
      iteration: 1203,
      lastTickAt: NOW - 8_200,
      nextTickAt: NOW + 11_800,
      delayMs: 20_000,
      policyLabel: "constant 20s",
      now: NOW,
    },
    {
      id: "tracker:suitest-camera",
      label: "Suitest · cameras",
      state: "running",
      iteration: 234,
      policyLabel: "constant 30s",
      now: NOW,
    },
    {
      id: "tracker:suitest-control-unit",
      label: "Suitest · control units",
      state: "running",
      iteration: 234,
      policyLabel: "constant 30s",
      now: NOW,
    },
    {
      id: "tracker:suitest-device",
      label: "Suitest · devices",
      state: "idle",
      iteration: 0,
      policyLabel: "constant 30s",
      now: NOW,
    },
    {
      id: "recovery:adb-camera",
      label: "Recovery · adb-camera",
      state: "running",
      iteration: 56,
      lastTickAt: NOW - 1_800,
      nextTickAt: NOW + 3_200,
      delayMs: 1_000,
      policyLabel: "constant 1s",
      detail: "all tripwires healthy",
      now: NOW,
    },
  ],
};

export const Online: Story = { args: ONLINE_ARGS };

export const Reconnecting: Story = { args: { ...ONLINE_ARGS, connection: "reconnecting" } };
