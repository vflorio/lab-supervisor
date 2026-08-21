// Il battito del monitoring: un lotto di esiti grezzi entra, la salute confermata esce, e con
// essa i fatti da pubblicare. Gli esiti si applicano **in ordine** sulla stessa faccia, perché
// una serie di tre osservazioni concordi dentro lo stesso lotto deve contare come tale.
// Non decide nulla sul recupero: pubblica `FacetBecame*` e si ferma lì (§4.1).

import * as DeviceId from "@lab/registry/domain/DeviceId";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as FacetHealth from "../domain/FacetHealth";
import * as FacetRef from "../domain/FacetRef";
import type { FlappingPolicy } from "../domain/FlappingPolicy";
import * as HealthSnapshot from "../domain/HealthSnapshot";
import type { MonitoringEvent } from "../domain/MonitoringEvent";
import type { ProbeOutcome } from "../domain/ProbeOutcome";
import * as Repository from "../ports/FacetHealthRepository";

export type Output = {
  readonly healths: ReadonlyArray<FacetHealth.FacetHealth>;
  readonly events: ReadonlyArray<MonitoringEvent>;
};

const fold = (
  snapshot: HealthSnapshot.HealthSnapshot,
  outcomes: ReadonlyArray<ProbeOutcome>,
  policy: FlappingPolicy,
): Output => {
  const touched = new Map<string, FacetHealth.FacetHealth>();
  const events: MonitoringEvent[] = [];

  for (const outcome of outcomes) {
    const key = FacetRef.key(outcome.ref);
    const current = touched.get(key) ?? HealthSnapshot.healthOf(snapshot, outcome.ref);
    const decision = FacetHealth.record(current, outcome, policy);
    touched.set(key, decision.state);
    events.push(...decision.events);
  }

  return { healths: [...touched.values()], events };
};

export const execute = (
  outcomes: ReadonlyArray<ProbeOutcome>,
  policy: FlappingPolicy,
): RTE.ReaderTaskEither<Repository.FacetHealthRepositoryEnv, never, Output> =>
  pipe(
    Repository.snapshotOf(
      pipe(
        outcomes,
        RA.map((outcome) => outcome.ref.deviceId),
        RA.uniq(DeviceId.Eq),
      ),
    ),
    RTE.map((snapshot) => fold(snapshot, outcomes, policy)),
    RTE.tap((output) => Repository.saveAll(output.healths)),
  );
