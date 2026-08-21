// L'esito grezzo di una sonda, già tradotto in lingua di dominio: un booleano e un istante,
// più un dettaglio leggibile che serve solo a scrivere una diagnosi sensata.
// Nessun `statusCode`, nessuno `stderr`, nessuna eccezione di libreria: se un errore tecnico
// arriva fin qui, l'ACL ha perso (A-6, NO-10). Una sonda che fallisce non è un errore, è una
// sonda che ha appena fatto il suo lavoro.

import type { Instant } from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";
import type { FacetRef } from "./FacetRef";

export type ProbeOutcome = {
  readonly ref: FacetRef;
  readonly at: Instant;
  readonly ok: boolean;
  readonly detail: O.Option<string>;
};

export const make = (ref: FacetRef, at: Instant, ok: boolean, detail: O.Option<string> = O.none): ProbeOutcome => ({
  ref,
  at,
  ok,
  detail,
});
