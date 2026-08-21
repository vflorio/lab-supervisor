// La porta delle sonde. `E = never` di proposito (A-6): una sonda che fallisce ha appena fatto
// il suo lavoro, e il fallimento è il risultato, non un errore. Se finisse nel canale d'errore,
// l'anti-flapping dovrebbe leggerlo da un catch.
// L'adapter traduce *tutto* in `ProbeOutcome`: timeout, connessione rifiutata, campo Suitest
// mancante. Un `AxiosError` o un exit code di adb che attraversasse questa porta sarebbe la
// prova che l'ACL ha perso (NO-10).

import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { FacetRef } from "../domain/FacetRef";
import type { ProbeOutcome } from "../domain/ProbeOutcome";

export interface HealthProbePort {
  readonly probe: (ref: FacetRef) => TE.TaskEither<never, ProbeOutcome>;
}

export interface HealthProbeEnv {
  readonly healthProbe: HealthProbePort;
}

export const probe =
  (ref: FacetRef): ReaderTaskEither<HealthProbeEnv, never, ProbeOutcome> =>
  (env) =>
    env.healthProbe.probe(ref);
