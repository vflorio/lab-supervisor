// Sonda finta: restituisce gli esiti che le sono stati scritti, e `ok: false` con un dettaglio
// esplicito per le facce di cui nessuno ha detto nulla — non sapere non è una buona notizia.

import type { Instant } from "@lab/kernel/Instant";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as FacetRef from "../domain/FacetRef";
import * as ProbeOutcome from "../domain/ProbeOutcome";
import type { HealthProbePort } from "../ports/HealthProbePort";

export interface ScriptedHealthProbe extends HealthProbePort {
  readonly set: (ref: FacetRef.FacetRef, ok: boolean) => void;
  readonly probed: () => ReadonlyArray<FacetRef.FacetRef>;
}

export const make = (now: () => Instant, seed: ReadonlyArray<readonly [FacetRef.FacetRef, boolean]> = []) => {
  const answers = new Map<string, boolean>(seed.map(([ref, ok]) => [FacetRef.key(ref), ok]));
  const calls: FacetRef.FacetRef[] = [];

  const probe: ScriptedHealthProbe = {
    set: (ref, ok) => {
      answers.set(FacetRef.key(ref), ok);
    },
    probed: () => [...calls],
    probe: (ref) => {
      calls.push(ref);
      const ok = answers.get(FacetRef.key(ref));
      return TE.right(
        ProbeOutcome.make(ref, now(), ok ?? false, ok === undefined ? O.some("nessuna risposta") : O.none),
      );
    },
  };

  return probe;
};
