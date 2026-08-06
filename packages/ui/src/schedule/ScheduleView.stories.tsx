import type { Meta, StoryObj } from "@storybook/react";
import type { ScheduleJson } from "@supervisor/core/schedule/codec";
import { SCHEDULE_TEMPLATES } from "@supervisor/core/schedule/templates";
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

// Le storie sotto partono dalla stessa libreria di riferimento in
// @supervisor/core/schedule/templates usata da ScheduleForm.stories, in sola lettura: mostrano
// come la griglia settimanale e la catena di step riflettono ciascuna composizione.

export const SubtractLunchBreak: Story = {
  name: "Composition: subtract (lunch break excluded)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Orario ufficio con pausa pranzo esclusa")!.json as ScheduleJson,
  },
};

export const IntersectionWindow: Story = {
  name: "Composition: intersection (recurring window)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Finestra ricorrente nei giorni feriali")!.json as ScheduleJson,
  },
};

export const BlackoutMaintenance: Story = {
  name: "Composition: subtract + recurring (nightly maintenance)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "H24 con manutenzione notturna esclusa")!.json as ScheduleJson,
  },
};

export const ExtendedWeekend: Story = {
  name: "Composition: three operators (extended weekend)",
  args: {
    value: SCHEDULE_TEMPLATES.find((t) => t.label === "Weekend esteso")!.json as ScheduleJson,
  },
};
