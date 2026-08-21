import type { ScheduleJson } from "./codec";

// Esempi pronti all'uso della composizione union/intersection/subtract sui verbi di ./codec.
// Servono da libreria di riferimento per il futuro schedule builder: l'utente parte da un
// template (o lo confronta con la propria bozza) invece che da uno step vuoto.

export interface ScheduleTemplate {
  readonly label: string;
  readonly description: string;
  readonly json: ScheduleJson;
}

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = [
  {
    label: "Sempre attivo",
    description: "Base neutra: sempre visibile. Punto di partenza tipico da cui sottrarre le eccezioni.",
    json: [["union", ["always"]]],
  },
  {
    label: "Orario ufficio",
    description: "Un solo step: feriali, 09:00–18:00.",
    json: [["union", ["weekdays", "09:00", "18:00"]]],
  },
  {
    label: "Orario ufficio con pausa pranzo esclusa",
    description: "Orario ufficio a cui si sottrae la finestra 12:30–13:30 (subtract su un union).",
    json: [
      ["union", ["weekdays", "09:00", "18:00"]],
      ["subtract", ["timeRange", "12:30", "13:30"]],
    ],
  },
  {
    label: "Finestra ricorrente nei giorni feriali",
    description:
      "Interseca l'orario ufficio con un'unica finestra di 30 minuti alle 10:00: il risultato è il prodotto logico dei due schedule (intersection, non union).",
    json: [
      ["union", ["weekdays", "09:00", "18:00"]],
      ["intersection", ["duration", "10:00", "30m"]],
    ],
  },
  {
    label: "H24 con manutenzione notturna esclusa",
    description: "Sempre visibile tranne una manutenzione ricorrente di 5 minuti ogni 6 ore (subtract + recurring).",
    json: [
      ["union", ["always"]],
      ["subtract", ["recurring", "6h", "5m"]],
    ],
  },
  {
    label: "Weekend esteso",
    description:
      "Weekend classico più il venerdì sera, con la notte tra sabato e domenica esclusa: tre step, tre operatori diversi (union, union, subtract).",
    json: [
      ["union", ["weekend", "10:00", "23:00"]],
      ["union", ["block", "friday", "18:00", "23:59"]],
      ["subtract", ["timeRange", "00:00", "06:00"]],
    ],
  },
];
