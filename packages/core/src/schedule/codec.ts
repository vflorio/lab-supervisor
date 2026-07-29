import * as E from "fp-ts/Either";
import * as t from "io-ts";
import * as DateTime from "../date-time";
import { type AppError, of } from "../errors";
import * as Schedule from "./schedule";

// Formato JSON per uno Schedule componibile. Ogni step e' una coppia [op, verbo], dove verbo e'
// una tupla [nome, ...args] (stessa idea di PolicyJson in ../retry/codec, ma con un op di
// composizione esplicito perche' union/intersection/subtract non sono un concat automatico
// come per le retry policy).
//
// es: [["union", ["weekdays", "09:00", "18:00"]], ["subtract", ["day", "monday"]]]
//
// L'op del primo step e' ignorato in decode (e' la base della composizione).

export type ScheduleStepArg = DateTime.DayOfWeek | DateTime.TimeString | DateTime.DurationString;
export type ScheduleVerbJson = readonly [string, ...ScheduleStepArg[]];
export type ScheduleOp = "union" | "intersection" | "subtract";
export type ScheduleStepJson = readonly [ScheduleOp, ScheduleVerbJson];
export type ScheduleJson = readonly ScheduleStepJson[];

const ScheduleStepArgCodec = t.union([DateTime.DayOfWeek, DateTime.TimeString, DateTime.DurationString]);

const isScheduleVerbJson = (u: unknown): u is ScheduleVerbJson =>
  Array.isArray(u) && u.length >= 1 && typeof u[0] === "string" && u.slice(1).every((a) => ScheduleStepArgCodec.is(a));

const validateVerbJson = (u: unknown, c: t.Context): t.Validation<ScheduleVerbJson> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [name, ...args]");

  const [head, ...tail] = u;
  if (typeof head !== "string") return t.failure(u, c, "First element must be a string (verb name)");

  for (const arg of tail) {
    if (!ScheduleStepArgCodec.is(arg))
      return t.failure(u, c, `Invalid arg: ${JSON.stringify(arg)} (expected DayOfWeek, TimeString or DurationString)`);
  }

  return t.success([head, ...tail] as unknown as ScheduleVerbJson);
};

const ScheduleVerbJsonCodec = new t.Type<ScheduleVerbJson, unknown[], unknown>(
  "ScheduleVerbJson",
  isScheduleVerbJson,
  validateVerbJson,
  (verb) => [verb[0], ...verb.slice(1)],
);

const ScheduleOpCodec = t.union([t.literal("union"), t.literal("intersection"), t.literal("subtract")]);

const isScheduleStepJson = (u: unknown): u is ScheduleStepJson =>
  Array.isArray(u) && u.length === 2 && ScheduleOpCodec.is(u[0]) && ScheduleVerbJsonCodec.is(u[1]);

const validateStepJson = (u: unknown, c: t.Context): t.Validation<ScheduleStepJson> => {
  if (!Array.isArray(u) || u.length !== 2) return t.failure(u, c, "Expected: [op, [name, ...args]]");

  const [op, verb] = u;
  if (!ScheduleOpCodec.is(op)) return t.failure(u, c, 'Expected op: "union" | "intersection" | "subtract"');

  return E.map((v: ScheduleVerbJson) => [op, v] as ScheduleStepJson)(ScheduleVerbJsonCodec.validate(verb, c));
};

const ScheduleStepJsonCodec = new t.Type<ScheduleStepJson, unknown[], unknown>(
  "ScheduleStepJson",
  isScheduleStepJson,
  validateStepJson,
  ([op, verb]) => [op, ScheduleVerbJsonCodec.encode(verb)],
);

export const ScheduleJsonCodec = t.array(ScheduleStepJsonCodec);

// Metadata per la UI: quali verbi esistono e che argomenti prendono, senza duplicare i
// costruttori runtime sotto (vedi ../retry/codec#POLICY_STEP_SCHEMA per lo stesso pattern).
export type ScheduleStepArgKind = "day" | "time" | "duration";

export interface ScheduleStepSchema {
  readonly name: string;
  readonly args: readonly { label: string; kind: ScheduleStepArgKind }[];
}

export const SCHEDULE_STEP_SCHEMA: readonly ScheduleStepSchema[] = [
  { name: "always", args: [] },
  { name: "never", args: [] },
  { name: "day", args: [{ label: "day", kind: "day" }] },
  {
    name: "timeRange",
    args: [
      { label: "from", kind: "time" },
      { label: "to", kind: "time" },
    ],
  },
  {
    name: "duration",
    args: [
      { label: "start", kind: "time" },
      { label: "duration", kind: "duration" },
    ],
  },
  {
    name: "recurring",
    args: [
      { label: "every", kind: "duration" },
      { label: "duration", kind: "duration" },
    ],
  },
  {
    name: "block",
    args: [
      { label: "day", kind: "day" },
      { label: "from", kind: "time" },
      { label: "to", kind: "time" },
    ],
  },
  {
    name: "weekdays",
    args: [
      { label: "from", kind: "time" },
      { label: "to", kind: "time" },
    ],
  },
  {
    name: "weekend",
    args: [
      { label: "from", kind: "time" },
      { label: "to", kind: "time" },
    ],
  },
];

export interface ScheduleDecodeError extends AppError<"ScheduleDecodeError"> {}

const scheduleDecodeError = of("ScheduleDecodeError");

// Minuti dall'inizio del giorno rappresentati come DurationString (coerente con l'uso di
// DurationString per le quantita' temporali nel resto della config, vedi retry/codec).
const durationToMinutes = (d: DateTime.DurationString): number => DateTime.durationToMs(d) / 60_000;

// Registro dei verbi: nome -> costruttore di Schedule dagli argomenti gia' tipati.
const VERBS: Record<string, ((args: readonly ScheduleStepArg[]) => Schedule.Schedule) | undefined> = {
  always: () => Schedule.always,
  never: () => Schedule.never,
  day: ([d]) => Schedule.day(DateTime.toDayNumber(d as DateTime.DayOfWeek)),
  timeRange: ([from, to]) =>
    Schedule.timeRange(DateTime.toTimeTuple(from as DateTime.TimeString), DateTime.toTimeTuple(to as DateTime.TimeString)),
  duration: ([start, amount]) =>
    Schedule.duration(DateTime.toTimeTuple(start as DateTime.TimeString), durationToMinutes(amount as DateTime.DurationString)),
  recurring: ([every, dur]) =>
    Schedule.recurring(durationToMinutes(every as DateTime.DurationString), durationToMinutes(dur as DateTime.DurationString)),
  block: ([d, from, to]) =>
    Schedule.block(
      DateTime.toDayNumber(d as DateTime.DayOfWeek),
      DateTime.toTimeTuple(from as DateTime.TimeString),
      DateTime.toTimeTuple(to as DateTime.TimeString),
    ),
  weekdays: ([from, to]) =>
    Schedule.weekdays(DateTime.toTimeTuple(from as DateTime.TimeString), DateTime.toTimeTuple(to as DateTime.TimeString)),
  weekend: ([from, to]) =>
    Schedule.weekend(DateTime.toTimeTuple(from as DateTime.TimeString), DateTime.toTimeTuple(to as DateTime.TimeString)),
};

const decodeVerb = (verb: ScheduleVerbJson): E.Either<ScheduleDecodeError, Schedule.Schedule> => {
  const [name, ...args] = verb;
  const build = VERBS[name];
  return build ? E.right(build(args)) : E.left(scheduleDecodeError(`Verbo schedule sconosciuto: "${name}"`));
};

const applyOp = (acc: Schedule.Schedule, step: Schedule.Schedule, op: ScheduleOp): Schedule.Schedule => {
  switch (op) {
    case "union":
      return Schedule.MonoidUnion.concat(acc, step);
    case "intersection":
      return Schedule.MonoidIntersection.concat(acc, step);
    case "subtract":
      return Schedule.subtract(acc, step);
  }
};

export interface ComposedStep {
  readonly op: ScheduleOp;
  readonly schedule: Schedule.Schedule;
  readonly result: Schedule.Schedule;
}

// Decodifica ogni step e compone i risultati intermedi (usato dalla UI per il breakdown per
// step nel tooltip della griglia). Un array vuoto e' uno stato valido (nessuno step ancora
// aggiunto), a differenza di PolicyJson che richiede almeno uno step.
export const compose = (json: ScheduleJson): E.Either<ScheduleDecodeError, readonly ComposedStep[]> => {
  const out: ComposedStep[] = [];
  let acc: Schedule.Schedule = Schedule.never;

  for (const [op, verb] of json) {
    const decoded = decodeVerb(verb);
    if (E.isLeft(decoded)) return decoded;

    const result = out.length === 0 ? decoded.right : applyOp(acc, decoded.right, op);
    acc = result;
    out.push({ op, schedule: decoded.right, result });
  }

  return E.right(out);
};

// Decodifica un ScheduleJson nello Schedule finale composto (Schedule.never se vuoto).
export const decode = (json: ScheduleJson): E.Either<ScheduleDecodeError, Schedule.Schedule> =>
  E.map((steps: readonly ComposedStep[]) => (steps.length > 0 ? steps[steps.length - 1]!.result : Schedule.never))(
    compose(json),
  );
