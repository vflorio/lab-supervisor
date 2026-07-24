import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { match } from "ts-pattern";
import type { PredicateExpression } from "./expression";

// -------------------------------------------------------------------------------------
// Codec - JSON: tuple taggate, coerenti con Command/Pipeline
// ["ref", "name"] | ["equals", "name", value] | ["includes", "name", "substr"]
// ["and", e, e, ...] | ["or", e, e, ...] | ["not", e]
// -------------------------------------------------------------------------------------

const PredicateValueCodec = t.union([t.boolean, t.string, t.number]);

const isPredicateExpression = (u: unknown): u is PredicateExpression =>
  typeof u === "object" && u !== null && "type" in u;

const validatePredicateExpression = (u: unknown, c: t.Context): t.Validation<PredicateExpression> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [tag, ...args]");

  const [tag, ...args] = u;
  if (typeof tag !== "string") return t.failure(u, c, "First element must be a string (predicate tag)");

  return match<string, t.Validation<PredicateExpression>>(tag)
    .with("ref", () => {
      const name = args[0];
      if (typeof name !== "string") return t.failure(u, c, "ref requires a predicate name");

      return t.success({ type: "ref" as const, name });
    })
    .with("equals", () => {
      const name = args[0];
      const value = args[1];
      if (typeof name !== "string") return t.failure(u, c, "equals requires a predicate name");
      if (!PredicateValueCodec.is(value)) return t.failure(u, c, "equals requires a boolean, string or number value");

      return t.success({ type: "equals" as const, name, value });
    })
    .with("includes", () => {
      const name = args[0];
      const value = args[1];
      if (typeof name !== "string") return t.failure(u, c, "includes requires a predicate name");
      if (typeof value !== "string") return t.failure(u, c, "includes requires a string value");

      return t.success({ type: "includes" as const, name, value });
    })
    .with("and", "or", (matchedTag) => {
      if (args.length === 0) return t.failure(u, c, `${matchedTag} requires at least one predicate`);

      const exprs: PredicateExpression[] = [];
      for (let i = 0; i < args.length; i++) {
        const result = validatePredicateExpression(args[i], [
          ...c,
          { key: `[${i + 1}]`, type: PredicateExpressionCodec, actual: args[i] },
        ]);
        if (E.isLeft(result)) return result as t.Validation<PredicateExpression>;
        exprs.push(result.right);
      }

      return t.success({ type: matchedTag as "and" | "or", exprs });
    })
    .with("not", () => {
      const result = validatePredicateExpression(args[0], [
        ...c,
        { key: "[1]", type: PredicateExpressionCodec, actual: args[0] },
      ]);
      if (E.isLeft(result)) return result as t.Validation<PredicateExpression>;

      return t.success({ type: "not" as const, expr: result.right });
    })
    .otherwise(() => t.failure(u, c, `Unknown predicate tag: "${tag}"`));
};

const encodePredicateExpression = (expr: PredicateExpression): unknown[] =>
  match(expr)
    .with({ type: "ref" }, ({ name }) => ["ref", name])
    .with({ type: "equals" }, ({ name, value }) => ["equals", name, value])
    .with({ type: "includes" }, ({ name, value }) => ["includes", name, value])
    .with({ type: "and" }, ({ exprs }) => ["and", ...exprs.map(encodePredicateExpression)])
    .with({ type: "or" }, ({ exprs }) => ["or", ...exprs.map(encodePredicateExpression)])
    .with({ type: "not" }, ({ expr: inner }) => ["not", encodePredicateExpression(inner)])
    .exhaustive();

export const PredicateExpressionCodec = new t.Type<PredicateExpression, unknown[], unknown>(
  "PredicateExpression",
  isPredicateExpression,
  validatePredicateExpression,
  encodePredicateExpression,
);
