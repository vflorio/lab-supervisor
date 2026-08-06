import type { Meta, StoryObj } from "@storybook/react";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import { ScheduleGrid } from "./ScheduleGrid";

const meta: Meta<typeof ScheduleGrid> = {
  title: "Activation-Schedule/ScheduleGrid",
  component: ScheduleGrid,
};

export default meta;
type Story = StoryObj<typeof ScheduleGrid>;

export const WorkingDays: Story = {
  args: {
    value: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      from: "08:00",
      to: "20:00",
    } as ActivationSchedule,
  },
};

export const NightShift: Story = {
  args: {
    value: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      from: "20:00",
      to: "08:00",
    } as ActivationSchedule,
  },
};

export const WeekendOnly: Story = {
  args: {
    value: {
      days: ["saturday", "sunday"],
      from: "09:00",
      to: "18:00",
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

export const Narrow: Story = {
  args: {
    value: {
      days: ["wednesday"],
      from: "14:00",
      to: "16:00",
    } as ActivationSchedule,
  },
};
