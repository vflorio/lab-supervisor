// Il giro di osservazione: sonda tutte le facce dei device monitorati, lascia che l'anti-flapping
// decida cosa è confermato, e chiede al core di aprire ciò che va aperto.
// Un dettaglio che è una scelta, non una svista: la reazione non parte dai soli eventi di
// transizione ma da **tutte** le facce che risultano giù alla fine del giro. Una reazione legata
// solo alla transizione lascerebbe scoperto il caso in cui una sessione è stata interrotta e il
// device è ancora rotto — finestra chiusa e riaperta, maintenance hold tolto, servizio riavviato:
// nessuna nuova transizione arriverà mai, perché la faccia è giù da prima. Riproporre i bersagli a
// ogni giro non costa nulla ed è sicuro per costruzione: `OpenRecoveryForConfirmedOutage` risponde
// `AlreadyActive` o `Blocked` a chi bussa due volte (INV-1, INV-9).

import * as Clock from "@lab/kernel/Clock";
import * as ProbeMonitoredFacets from "@lab/monitoring/application/ProbeMonitoredFacets";
import type { Facet } from "@lab/monitoring/domain/Facet";
import type { FlappingPolicy } from "@lab/monitoring/domain/FlappingPolicy";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import { onFacetBecameUnhealthy } from "@lab/recovery";
import type * as OpenRecoveryForConfirmedOutage from "@lab/recovery/application/OpenRecoveryForConfirmedOutage";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { AppEnv } from "../Environment";
import { describeMonitoring } from "../Events";
import type { Logger } from "../Logger";

const describeOutcome = (outcome: OpenRecoveryForConfirmedOutage.Outcome): string => {
  switch (outcome._tag) {
    case "Opened":
      return `sessione ${String(outcome.session.id)} aperta`;
    case "Superseded":
      return `sessione ${String(outcome.session.id)} aperta, assorbite ${outcome.superseded.length}`;
    case "AlreadyActive":
      return `già in carico alla sessione ${String(outcome.sessionId)}`;
    case "Blocked":
      return `in cooldown fino a ${new Date(outcome.until).toISOString()}`;
    case "NoProfile":
      return "nessun profilo per il kind: monitorato ma non curato";
    case "NotSupervisable":
      return "device in custodia a un operatore: non si scavalca";
  }
};

const isInteresting = (outcome: OpenRecoveryForConfirmedOutage.Outcome): boolean =>
  outcome._tag === "Opened" || outcome._tag === "Superseded" || outcome._tag === "Blocked";

export const execute = (policy: FlappingPolicy, logger: Logger): RTE.ReaderTaskEither<AppEnv, never, void> =>
  pipe(
    ProbeMonitoredFacets.execute(policy),
    RTE.tapIO((output) => () => {
      for (const event of output.events) logger.info(describeMonitoring(event));
    }),
    RTE.map((output) => [
      ...new Set(
        output.healths
          .filter((health) => HealthStatus.isUnhealthy(health.status))
          .map((health): Facet => health.ref.facet),
      ),
    ]),
    RTE.tapIO((facets) => () => logger.debug(`facce giù: ${facets.length === 0 ? "nessuna" : facets.join(", ")}`)),
    RTE.flatMap((facets) =>
      pipe(
        Clock.now,
        RTE.flatMap((now) =>
          pipe(
            facets,
            RTE.traverseSeqArray((facet: Facet) => onFacetBecameUnhealthy.execute(facet, now)),
          ),
        ),
      ),
    ),
    RTE.tapIO((results) => () => {
      for (const result of results.flat())
        (isInteresting(result.outcome) ? logger.info : logger.debug)(describeOutcome(result.outcome));
    }),
    RTE.asUnit,
  );
