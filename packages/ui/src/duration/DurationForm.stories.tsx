import type { Meta, StoryObj } from "@storybook/react";
import type { DurationString } from "@supervisor/core/date-time";
import { useState } from "react";
import { DurationForm } from "./DurationForm";

const meta: Meta<typeof DurationForm> = {
  title: "Duration/DurationForm",
  component: DurationForm,
  argTypes: {
    value: { control: "text" },
    label: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof DurationForm>;

export const Default: Story = {
  args: {
    value: "2m" as DurationString,
    label: "delay",
  },
  render: function Render(args) {
    const [value, setValue] = useState<DurationString>(args.value);
    return <DurationForm {...args} value={value} onChange={setValue} />;
  },
};
