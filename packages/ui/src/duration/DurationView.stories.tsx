import type { Meta, StoryObj } from "@storybook/react";
import type { DurationString } from "@supervisor/core/date-time";
import { DurationView } from "./DurationView";

const meta: Meta<typeof DurationView> = {
  title: "Duration/DurationView",
  component: DurationView,
  argTypes: {
    value: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof DurationView>;

export const Default: Story = {
  args: {
    value: "2m" as DurationString,
  },
};
