import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as M from "fp-ts/Monoid";
import * as Ord from "fp-ts/Ord";
import * as t from "io-ts";
import * as DateTime from "../date-time";
import * as Schedule from "../schedule";

// Schedule di lavoro: giorni attivi e range orario
const ActivationScheduleRaw = t.type({
  days: t.array(DateTime.DayOfWeek),
  from: DateTime.TimeString,
  to: DateTime.TimeString,
});

export const ActivationScheduleCodec = new t.Type<t.TypeOf<typeof ActivationScheduleRaw>>(
  "ActivationSchedule",
  ActivationScheduleRaw.is,
  (value, context) =>
    pipe(
      ActivationScheduleRaw.validate(value, context),
      E.flatMap((schedule) =>
        Ord.lt(DateTime.OrdValidTimeString)(schedule.from, schedule.to)
          ? t.success(schedule)
          : t.failure(
              value,
              context,
              `ActivationSchedule.from (${schedule.from}) must be before ActivationSchedule.to (${schedule.to})`,
            ),
      ),
    ),
  t.identity,
);

export type ActivationSchedule = t.TypeOf<typeof ActivationScheduleCodec>;

// Convertions

export const format = (ws: t.TypeOf<typeof ActivationScheduleCodec>): string =>
  `ActivationSchedule(days: [${ws.days.join(", ")}], from: ${ws.from}, to: ${ws.to})`;

// Costruisce lo Schedule dal ActivationSchedule in config
export const toSchedule = (ActivationSchedule: ActivationSchedule): Schedule.Schedule => {
  const range = Schedule.timeRange(
    DateTime.toTimeTuple(ActivationSchedule.from),
    DateTime.toTimeTuple(ActivationSchedule.to),
  );

  const days = ActivationSchedule.days.map(flow(DateTime.toDayNumber, Schedule.day));

  const anyDay = M.concatAll(Schedule.MonoidUnion)(days);

  return Schedule.MonoidIntersection.concat(anyDay, range);
};
