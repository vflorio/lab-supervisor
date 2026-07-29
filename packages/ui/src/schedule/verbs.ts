import * as Schedule from "@supervisor/core/schedule";

type Time = [number, number];

interface ScheduleVerb {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly FieldDef[];
  readonly build: (values: Record<string, string>) => { schedule: Schedule.Schedule; label: string };
}

const parseTime = (v: string): Time => {
  const [h, m] = v.split(":").map(Number);
  return [h ?? 0, m ?? 0];
};

interface FieldDef {
  readonly name: string;
  readonly label: string;
  readonly type: "time" | "number" | "day";
  readonly defaultValue: string;
}

export const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

export const VERBS: ScheduleVerb[] = [
  {
    id: "always",
    name: "Sempre visibile",
    fields: [],
    build: () => ({ schedule: Schedule.always, label: "Sempre visibile" }),
  },
  {
    id: "never",
    name: "Mai visibile",
    fields: [],
    build: () => ({ schedule: Schedule.never, label: "Mai visibile" }),
  },
  {
    id: "day",
    name: "Giorno specifico",
    fields: [{ name: "day", label: "Giorno (0=Lun … 6=Dom)", type: "day", defaultValue: "0" }],
    build: (v) => {
      const d = Number(v.day);
      return { schedule: Schedule.day(d), label: `${DAY_NAMES[d] ?? `Giorno ${d}`}` };
    },
  },
  {
    id: "timeRange",
    name: "Range orario",
    fields: [
      { name: "from", label: "Da", type: "time", defaultValue: "09:00" },
      { name: "to", label: "A", type: "time", defaultValue: "18:00" },
    ],
    build: (v) => ({
      schedule: Schedule.timeRange(parseTime(v.from), parseTime(v.to)),
      label: `Orario ${v.from}-${v.to}`,
    }),
  },
  {
    id: "block",
    name: "Blocco (giorno + orario)",
    fields: [
      { name: "day", label: "Giorno", type: "day", defaultValue: "0" },
      { name: "from", label: "Da", type: "time", defaultValue: "09:00" },
      { name: "to", label: "A", type: "time", defaultValue: "18:00" },
    ],
    build: (v) => {
      const d = Number(v.day);
      return {
        schedule: Schedule.block(d, parseTime(v.from), parseTime(v.to)),
        label: `${DAY_NAMES[d] ?? `G${d}`} ${v.from}-${v.to}`,
      };
    },
  },
  {
    id: "weekdays",
    name: "Feriali (Lun-Ven)",
    fields: [
      { name: "from", label: "Da", type: "time", defaultValue: "09:00" },
      { name: "to", label: "A", type: "time", defaultValue: "18:00" },
    ],
    build: (v) => ({
      schedule: Schedule.weekdays(parseTime(v.from), parseTime(v.to)),
      label: `Feriali ${v.from}-${v.to}`,
    }),
  },
  {
    id: "weekend",
    name: "Weekend (Sab-Dom)",
    fields: [
      { name: "from", label: "Da", type: "time", defaultValue: "09:00" },
      { name: "to", label: "A", type: "time", defaultValue: "18:00" },
    ],
    build: (v) => ({
      schedule: Schedule.weekend(parseTime(v.from), parseTime(v.to)),
      label: `Weekend ${v.from}-${v.to}`,
    }),
  },
  {
    id: "duration",
    name: "Durata da orario",
    fields: [
      { name: "start", label: "Inizio", type: "time", defaultValue: "14:30" },
      { name: "minutes", label: "Durata (min)", type: "number", defaultValue: "15" },
    ],
    build: (v) => ({
      schedule: Schedule.duration(parseTime(v.start), Number(v.minutes)),
      label: `${v.start} per ${v.minutes}min`,
    }),
  },
  {
    id: "recurring",
    name: "Ricorrente",
    fields: [
      { name: "every", label: "Ogni N min", type: "number", defaultValue: "30" },
      { name: "dur", label: "Durata (min)", type: "number", defaultValue: "5" },
    ],
    build: (v) => ({
      schedule: Schedule.recurring(Number(v.every), Number(v.dur)),
      label: `${v.dur}min ogni ${v.every}min`,
    }),
  },
];
