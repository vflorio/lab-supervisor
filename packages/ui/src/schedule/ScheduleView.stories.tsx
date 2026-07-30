import type { Meta, StoryObj } from "@storybook/react";
import type { ScheduleJson } from "@supervisor/core/schedule/codec";
import { ScheduleView } from "./ScheduleView";

const meta: Meta<typeof ScheduleView> = {
  title: "Schedule/ScheduleView",
  component: ScheduleView,
};

export default meta;
type Story = StoryObj<typeof ScheduleView>;

export const Default: Story = {
  args: {
    value: [
      ["union", ["weekdays", "08:00", "20:00"]],
      ["intersection", ["timeRange", "09:00", "17:00"]],
    ] as ScheduleJson,
  },
};

export const Simple: Story = {
  args: {
    value: [["union", ["always"]]] as ScheduleJson,
  },
};
