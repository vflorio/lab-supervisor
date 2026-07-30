import type { Meta, StoryObj } from "@storybook/react";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import { useState } from "react";
import { ActivationScheduleForm } from "./ActivationScheduleForm";

const meta: Meta<typeof ActivationScheduleForm> = {
  title: "Activation-Schedule/ActivationScheduleForm",
  component: ActivationScheduleForm,
};

export default meta;
type Story = StoryObj<typeof ActivationScheduleForm>;

export const Default: Story = {
  args: {
    value: {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      from: "08:00",
      to: "20:00",
    } as ActivationSchedule,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ActivationSchedule>(args.value);
    return <ActivationScheduleForm {...args} value={value} onChange={setValue} />;
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
  render: function Render(args) {
    const [value, setValue] = useState<ActivationSchedule>(args.value);
    return <ActivationScheduleForm {...args} value={value} onChange={setValue} />;
  },
};
