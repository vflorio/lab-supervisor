import type { Meta, StoryObj } from "@storybook/react";
import { SCHEDULE_STEP_SCHEMA, type ScheduleJson } from "@supervisor/core/schedule/codec";
import { SCHEDULE_TEMPLATES } from "@supervisor/core/schedule/templates";
import { useState } from "react";
import { ScheduleBuilder } from "./ScheduleBuilder";

const meta: Meta<typeof ScheduleBuilder> = {
  title: "Schedule/ScheduleBuilder",
  component: ScheduleBuilder,
};

export default meta;
type Story = StoryObj<typeof ScheduleBuilder>;

export const Empty: Story = {
  args: {
    value: [] as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleBuilder {...args} value={value} onChange={setValue} />;
  },
};

export const WithTemplate: Story = {
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Orario ufficio con pausa pranzo esclusa")!.json as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleBuilder {...args} value={value} onChange={setValue} />;
  },
};
