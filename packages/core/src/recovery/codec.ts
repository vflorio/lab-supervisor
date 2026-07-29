import * as t from "io-ts";
import { DurationString } from "../date-time";
import { NotifyRuleCodec } from "../notify/codec";
import { PredicateExpressionCodec } from "../predicates/expression-codec";
import { PolicyJsonCodec } from "../retry/codec";
import { PipelineCodec } from "../workflow/pipeline-codec";

export const RecoveryTripwireCodec = t.intersection([
  t.type({
    grace: DurationString,
    predicate: PredicateExpressionCodec,
    pipeline: PipelineCodec,
    retry: PolicyJsonCodec,
  }),
  // `notify`: opzionale, i tripwire senza notifiche restano validi
  t.partial({
    notify: t.array(NotifyRuleCodec),
  }),
]);

export const RecoveryPolicyCodec = t.type({
  label: t.string,
  domain: t.string,
  tripwires: t.array(RecoveryTripwireCodec),
});
