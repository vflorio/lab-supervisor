import * as t from "io-ts";
import { DurationString } from "../date-time";
import { PredicateExpressionCodec } from "../predicates/expression-codec";
import { PolicyJsonCodec } from "../retry/codec";
import { PipelineCodec } from "../workflow/pipeline-codec";

// -------------------------------------------------------------------------------------
// Codec
// -------------------------------------------------------------------------------------

export const RecoveryTripwireCodec = t.type({
  grace: DurationString,
  predicate: PredicateExpressionCodec,
  pipeline: PipelineCodec,
  retry: PolicyJsonCodec,
});

export const RecoveryPolicyCodec = t.type({
  label: t.string,
  domain: t.string,
  tripwires: t.array(RecoveryTripwireCodec),
});
