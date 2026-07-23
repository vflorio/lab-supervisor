import * as t from "io-ts";
import { DurationString } from "../date-time";
import { PredicateExprCodec } from "../predicates/expr-codec";
import { PolicyJsonCodec } from "../retry/codec";
import { PipelineCodec } from "../workflow/pipeline-codec";

// -------------------------------------------------------------------------------------
// Codec
// -------------------------------------------------------------------------------------

export const RecoveryLevelCodec = t.type({
  grace: DurationString,
  predicate: PredicateExprCodec,
  pipeline: PipelineCodec,
  retry: PolicyJsonCodec,
});

export const RecoveryPolicyCodec = t.type({
  label: t.string,
  levels: t.array(RecoveryLevelCodec),
});
