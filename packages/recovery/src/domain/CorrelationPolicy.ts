// La regola di quorum più il tempo che si concede al cluster prima di agire. Vive sul profilo
// della **CU**, che è l'unico posto sensato: è una policy dell'hub, non un parametro orfano.

import * as Duration from "@lab/kernel/Duration";
import * as CorrelationRule from "./CorrelationRule";

export type CorrelationPolicy = {
  readonly rule: CorrelationRule.CorrelationRule;
  readonly gracePeriod: Duration.Duration;
};

export const make = (
  rule: CorrelationRule.CorrelationRule = CorrelationRule.allChildren,
  gracePeriod: Duration.Duration = Duration.minutes(1),
): CorrelationPolicy => ({ rule, gracePeriod });
