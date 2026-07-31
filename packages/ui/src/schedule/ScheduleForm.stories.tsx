import type { Meta, StoryObj } from "@storybook/react";
import { SCHEDULE_STEP_SCHEMA, type ScheduleJson } from "@supervisor/core/schedule/codec";
import { SCHEDULE_TEMPLATES } from "@supervisor/core/schedule/templates";
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

// Le storie sotto partono dalla libreria di riferimento in @supervisor/core/schedule/templates -
// gli stessi template che il futuro schedule builder userà come punto di partenza per l'utente -
// e mostrano il ventaglio di composizioni possibili union/intersection/subtract sui verbi, dal
// caso base fino alla combinazione di tre operatori diversi.

export const SubtractLunchBreak: Story = {
  name: "Composition: subtract (lunch break excluded)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Orario ufficio con pausa pranzo esclusa")!.json as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};

export const IntersectionWindow: Story = {
  name: "Composition: intersection (recurring window)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Finestra ricorrente nei giorni feriali")!.json as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};

export const BlackoutMaintenance: Story = {
  name: "Composition: subtract + recurring (nightly maintenance)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "H24 con manutenzione notturna esclusa")!.json as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};

export const ExtendedWeekend: Story = {
  name: "Composition: three operators (extended weekend)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Weekend esteso")!.json as ScheduleJson,
    schema: SCHEDULE_STEP_SCHEMA,
  },
  render: function Render(args) {
    const [value, setValue] = useState<ScheduleJson>(args.value);
    return <ScheduleForm {...args} value={value} onChange={setValue} />;
  },
};
