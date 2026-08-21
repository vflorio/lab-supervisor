// Un'autorizzazione, non un orario (FATTO-14). Fuori dalla finestra non parte nessun comando,
// così nessun device si accende di notte — e la finestra resta **live** anche a recupero
// iniziato (INV-13): se una persona la chiude a metà, ha effetto al tick successivo.
// `isOpen` è puro: `Intl` traduce un istante in ora locale di una zona senza leggere
// l'orologio di sistema, quindi resta una funzione deterministica dei suoi argomenti.

import * as Instant from "@lab/kernel/Instant";

export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type TimeOfDay = { readonly hour: number; readonly minute: number };

export type SupervisionWindow = {
  readonly days: ReadonlyArray<DayOfWeek>;
  readonly from: TimeOfDay;
  readonly to: TimeOfDay;
  readonly zone: string;
};

export const time = (hour: number, minute = 0): TimeOfDay => ({ hour, minute });

export const workdays: ReadonlyArray<DayOfWeek> = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export const make = (
  days: ReadonlyArray<DayOfWeek>,
  from: TimeOfDay,
  to: TimeOfDay,
  zone: string,
): SupervisionWindow => ({ days, from, to, zone });

// Sempre autorizzata. Esiste per i test e per i lab che sorvegliano 24/7, non come default.
export const always: SupervisionWindow = make(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  time(0, 0),
  time(24, 0),
  "UTC",
);

export const closed: SupervisionWindow = make([], time(0, 0), time(0, 0), "UTC");

const minutesOf = (time: TimeOfDay): number => time.hour * 60 + time.minute;

const weekdays: Record<string, DayOfWeek> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

const localize = (zone: string, at: Instant.Instant): { day: DayOfWeek; minutes: number } | undefined => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Instant.toEpochMillis(at)));

  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  const day = weekdays[read("weekday") ?? ""];
  const hour = Number(read("hour"));
  const minute = Number(read("minute"));
  return day === undefined || Number.isNaN(hour) || Number.isNaN(minute)
    ? undefined
    : { day, minutes: hour * 60 + minute };
};

// Una finestra che finisce prima di cominciare è vuota, non a cavallo della mezzanotte: una
// finestra che scavalca il giorno renderebbe ambiguo a quale giorno appartiene la seconda metà,
// e nel lab non serve. Se servirà, sarà un caso in più qui, non un `if` sparso altrove.
export const isOpen = (window: SupervisionWindow, at: Instant.Instant): boolean => {
  const from = minutesOf(window.from);
  const to = minutesOf(window.to);
  if (to <= from) return false;

  const local = localize(window.zone, at);
  return local !== undefined && window.days.includes(local.day) && local.minutes >= from && local.minutes < to;
};
