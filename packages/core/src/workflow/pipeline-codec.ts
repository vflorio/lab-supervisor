import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { match } from "ts-pattern";
import type { Pipeline } from "./pipeline";

// Tuple taggate, coerenti con Command/PolicyStepJson:
// ["workflow", "name"] | ["and", p, p, ...] | ["or", p, p, ...] | ["not", p]

const isPipeline = (u: unknown): u is Pipeline => typeof u === "object" && u !== null && "type" in u;

const validatePipeline = (u: unknown, c: t.Context): t.Validation<Pipeline> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [tag, ...args]");

  const [tag, ...args] = u;
  if (typeof tag !== "string") return t.failure(u, c, "First element must be a string (pipeline tag)");

  return match<string, t.Validation<Pipeline>>(tag)
    .with("workflow", () => {
      const workflowName = args[0];
      if (typeof workflowName !== "string") return t.failure(u, c, "workflow requires a workflow name");

      return t.success({ type: "workflow" as const, workflowName });
    })
    .with("and", "or", (matchedTag) => {
      if (args.length === 0) return t.failure(u, c, `${matchedTag} requires at least one pipeline`);

      const pipelines: Pipeline[] = [];
      for (let i = 0; i < args.length; i++) {
        const result = validatePipeline(args[i], [...c, { key: `[${i + 1}]`, type: PipelineCodec, actual: args[i] }]);
        if (E.isLeft(result)) return result as t.Validation<Pipeline>;
        pipelines.push(result.right);
      }

      return t.success({ type: matchedTag as "and" | "or", pipelines });
    })
    .with("not", () => {
      const result = validatePipeline(args[0], [...c, { key: "[1]", type: PipelineCodec, actual: args[0] }]);
      if (E.isLeft(result)) return result as t.Validation<Pipeline>;

      return t.success({ type: "not" as const, pipeline: result.right });
    })
    .otherwise(() => t.failure(u, c, `Unknown pipeline tag: "${tag}"`));
};

const encodePipeline = (pipeline: Pipeline): unknown[] =>
  match(pipeline)
    .with({ type: "workflow" }, ({ workflowName }) => ["workflow", workflowName])
    .with({ type: "and" }, ({ pipelines }) => ["and", ...pipelines.map(encodePipeline)])
    .with({ type: "or" }, ({ pipelines }) => ["or", ...pipelines.map(encodePipeline)])
    .with({ type: "not" }, ({ pipeline: inner }) => ["not", encodePipeline(inner)])
    .exhaustive();

export const PipelineCodec = new t.Type<Pipeline, unknown[], unknown>(
  "Pipeline",
  isPipeline,
  validatePipeline,
  encodePipeline,
);
