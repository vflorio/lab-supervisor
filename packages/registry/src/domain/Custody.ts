// Chi ha il diritto di comandare questo device *adesso*.
// Copre con un solo tipo due regole che altrimenti sarebbero due `if` sparsi: non scavalcare
// mai uno spegnimento manuale fatto per manutenzione (FATTO-15) e non litigare con la futura
// feature di registrazione. È anche la ragione per cui, il giorno in cui arriverà lo smart
// plug (NF-3), non servirà un'invariante nuova: un plug spento a mano è un `Operator` hold,
// esattamente come una CU.
// `Operator` non scade: lo toglie una persona. `Recorder` scade da solo, perché una
// registrazione ha una fine nota.

import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import type { RecordingSessionId } from "./RecordingSessionId";

export type Custody =
  | { readonly _tag: "Supervisor" }
  | { readonly _tag: "Operator"; readonly reason: string; readonly since: Instant }
  | { readonly _tag: "Recorder"; readonly sessionId: RecordingSessionId; readonly until: Instant };

export const supervisor: Custody = { _tag: "Supervisor" };

export const operator = (reason: string, since: Instant): Custody => ({ _tag: "Operator", reason, since });

export const recorder = (sessionId: RecordingSessionId, until: Instant): Custody => ({
  _tag: "Recorder",
  sessionId,
  until,
});

// Il supervisore può comandare solo se nessun altro ha il device in mano. Una custodia del
// registratore scaduta non è più una custodia: il device torna al supervisore da solo, senza
// che nessuno debba rilasciarla.
export const allowsSupervisor = (custody: Custody, now: Instant): boolean => {
  switch (custody._tag) {
    case "Supervisor":
      return true;
    case "Operator":
      return false;
    case "Recorder":
      return Instants.isAtOrAfter(now, custody.until);
  }
};

export const isMaintenanceHold = (custody: Custody): boolean => custody._tag === "Operator";
