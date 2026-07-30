import type { Meta, StoryObj } from "@storybook/react";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import { ActivationScheduleView } from "./ActivationScheduleView";

const meta: Meta<typeof ActivationScheduleView> = {
  title: "Activation-Schedule/ActivationScheduleView",
  component: ActivationScheduleView,
};

export default meta;
type Story = StoryObj<typeof ActivationScheduleView>;

export const Default: Story = {
  args: {
    value: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      from: "08:00",
      to: "20:00",
    } as ActivationSchedule,
  },
};

export const AllDay: Story = {
  args: {
    value: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      from: "00:00",
      to: "23:59",
    } as ActivationSchedule,
  },
};
