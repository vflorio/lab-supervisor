import * as M from "fp-ts/Monoid";
import { getDay } from "./date-time";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface TimeSlot {
  readonly day: number; // 0 = lunedì, 6 = domenica
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
}

// Uno schedule è una funzione che dato un TimeSlot restituisce "true" se lo Slot è visibile
export type Schedule = (slot: TimeSlot) => boolean;

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

// Converte ore e minuti in minuti dall'inizio del giorno
const toMinutes = (h: number, m: number): number => h * 60 + m;

// Minuti dall'inizio del giorno per un TimeSlot
const slotToMinutes = (slot: TimeSlot): number => toMinutes(slot.hour, slot.minute);

// Crea un TimeSlot da giorno, ore e minuti (TODO: assertare il range)
export const timeSlot = (day: number, hour: number, minute: number): TimeSlot => ({
  day,
  hour,
  minute,
});

export const toTimeSlot = (now: Date): TimeSlot => ({
  day: getDay(now),
  hour: now.getHours(),
  minute: now.getMinutes(),
});

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

type Time = [number, number]; // [0-23, 0-59]

// Visibile in un determinato giorno della settimana
export const day =
  (d: number): Schedule =>
  (slot) =>
    slot.day === d;

// Visibile in un range orario
export const timeRange = (from: Time, to: Time): Schedule => {
  const fromMin = toMinutes(from[0], from[1]);
  const toMin = toMinutes(to[0], to[1]);
  return (slot) => {
    const m = slotToMinutes(slot);
    return m >= fromMin && m < toMin;
  };
};

// Visibile per una durata a partire da un orario
// es: duration([14, 30], 20) -> visibile 14:30-14:50
export const duration = (start: Time, amountMinutes: number): Schedule => {
  const startMin = toMinutes(start[0], start[1]);
  return timeRange(
    [Math.floor(startMin / 60), startMin % 60],
    [Math.floor((startMin + amountMinutes) / 60), (startMin + amountMinutes) % 60],
  );
};

// Visibile ogni N minuti per una durata di D minuti nell'arco delle 24h
// es: recurring(30, 5) -> 5 minuti di visibilità ogni 30
export const recurring =
  (everyMinutes: number, durationMinutes: number): Schedule =>
  (slot) =>
    slotToMinutes(slot) % everyMinutes < durationMinutes;

// Sempre visibile
export const always: Schedule = () => true;

// Mai visibile
export const never: Schedule = () => false;

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

// Inverte la visibilità: visibile dove era nascosto e viceversa
export const invert =
  (s: Schedule): Schedule =>
  (slot) =>
    !s(slot);

// -------------------------------------------------------------------------------------
// Instances
// -------------------------------------------------------------------------------------

// Nella teoria dei Gruppi, un monoide è una struttura algebrica che rispetta gli assiomi:
// - Chiusura: a * b ∈ M
//     (Magma) il risultato rientra nell'insieme M
// - Associatività: (a * b) * c = a * (b * c)
//     (Semigruppo) Il risultato non dipende da come si raggruppano gli operandi
// - Elemento neutro: a * e = e * a = a
//     (Monoide) esiste un elemento neutro e tale che la composizione con esso non cambia l'elemento
// M rappresenta l'insieme degli elementi
// ∗ rappresenta un'operazione binaria
// ∈ rappresenta l'appartenenza all'insieme

// Unione di due schedule:
// visibile se ALMENO UNO dei due è attivo
export const MonoidUnion: M.Monoid<Schedule> = {
  concat: (first, second) => (slot) => first(slot) || second(slot),
  empty: () => false,
};

// Intersezione di due schedule:
// visibile solo se ENTRAMBI sono attivi
export const MonoidIntersection: M.Monoid<Schedule> = {
  concat: (first, second) => (slot) => first(slot) && second(slot),
  empty: () => true,
};

// -------------------------------------------------------------------------------------
// Derived combinators
// -------------------------------------------------------------------------------------

// Blocco di visibilità: un giorno specifico in un range orario
export const block = (d: number, from: Time, to: Time): Schedule =>
  MonoidIntersection.concat(day(d), timeRange(from, to));

// Visibile tutti i giorni feriali (Lun-Ven) in un range orario
export const weekdays = (from: Time, to: Time): Schedule =>
  M.concatAll(MonoidUnion)([0, 1, 2, 3, 4].map((d) => block(d, from, to)));

// Visibile nel weekend (Sab-Dom) in un range orario
export const weekend = (from: Time, to: Time): Schedule =>
  M.concatAll(MonoidUnion)([5, 6].map((d) => block(d, from, to)));

// Blackout: rimuove una finestra temporale da uno schedule esistente
export const withBlackout = (schedule: Schedule, from: Time, to: Time): Schedule =>
  MonoidIntersection.concat(schedule, invert(timeRange(from, to)));

// Sottrae: visibile dove "base" è attivo ma "exclude" non lo è
export const subtract = (base: Schedule, exclude: Schedule): Schedule =>
  MonoidIntersection.concat(base, invert(exclude));
