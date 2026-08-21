// Contesto generico: consegnare un incidente a chi deve leggerlo. Dipende da `recovery` e mai il
// contrario (A-1). Espone il notifier e la resa in blocchi neutri; il trasporto HTTP resta in
// `internal/`, perché il momento in cui qualcuno lo importa da fuori è il momento in cui questo
// package ha smesso di essere un confine.

export * as IncidentMessage from "./IncidentMessage";
export * as SlackNotifier from "./SlackNotifier";
