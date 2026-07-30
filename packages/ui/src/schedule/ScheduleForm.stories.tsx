import type { Meta, StoryObj } from "@storybook/react";
import { SCHEDULE_STEP_SCHEMA, type ScheduleJson } from "@supervisor/core/schedule/codec";
import { useState } from "react";
import { ScheduleForm } from "./ScheduleForm";

const meta: Meta<typeof ScheduleForm> = {
  title: "Schedule/ScheduleForm",
  component: ScheduleForm,
};

export default meta;
type Story = StoryObj<typeof ScheduleForm>;

export const Default: Story = {
  args: {
    value: [
      ["union", ["weekdays", "08:00", "20:00"]],
      ["intersection", ["timeRange", "09:00", "17:00"]],
    ] as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};

export const Empty: Story = {
  args: {
    value: [] as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};

export const Simple: Story = {
  args: {
    value: [["union", ["always"]]] as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};
