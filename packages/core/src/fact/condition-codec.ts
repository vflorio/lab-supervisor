import * as t from "io-ts";
import { match } from "ts-pattern";
import { booleanTreeCodec } from "../boolean-tree/codec";
import type { Condition, FactLeaf } from "./condition";

// Tagged tuples: ["truthy", "name"] | ["equals", name, value] | ["includes", name, substr]
// And/or/not handled by ../boolean-tree/codec; leaves only

const FactValueCodec = t.union([t.boolean, t.string, t.number]);

const isFactLeaf = (u: unknown): u is FactLeaf => typeof u === "object" && u !== null && "type" in u;

const validateFactLeaf = (u: unknown, c: t.Context): t.Validation<FactLeaf> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [tag, ...args]");

  const [tag, ...args] = u;
  if (typeof tag !== "string") return t.failure(u, c, "First element must be a string (condition tag)");

  return match<string, t.Validation<FactLeaf>>(tag)
    .with("truthy", () => {
      const name = args[0];
      if (typeof name !== "string") return t.failure(u, c, "truthy requires a fact name");

      return t.success({ type: "truthy" as const, name });
    })
    .with("equals", () => {
      const name = args[0];
      const value = args[1];
      if (typeof name !== "string") return t.failure(u, c, "equals requires a fact name");
      if (!FactValueCodec.is(value)) return t.failure(u, c, "equals requires a boolean, string or number value");

      return t.success({ type: "equals" as const, name, value });
    })
    .with("includes", () => {
      const name = args[0];
      const value = args[1];
      if (typeof name !== "string") return t.failure(u, c, "includes requires a fact name");
      if (typeof value !== "string") return t.failure(u, c, "includes requires a string value");

      return t.success({ type: "includes" as const, name, value });
    })
    .otherwise(() => t.failure(u, c, `Unknown condition tag: "${tag}"`));
};

const encodeFactLeaf = (leaf: FactLeaf): unknown[] =>
  match(leaf)
    .with({ type: "truthy" }, ({ name }) => ["truthy", name])
    .with({ type: "equals" }, ({ name, value }) => ["equals", name, value])
    .with({ type: "includes" }, ({ name, value }) => ["includes", name, value])
    .exhaustive();

export const FactLeafCodec = new t.Type<FactLeaf, unknown[], unknown>(
  "FactLeaf",
  isFactLeaf,
  validateFactLeaf,
  encodeFactLeaf,
);

export const ConditionCodec: t.Type<Condition, unknown[], unknown> = booleanTreeCodec("Condition", FactLeafCodec);
