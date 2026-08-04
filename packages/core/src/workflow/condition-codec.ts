import * as t from "io-ts";
import { booleanTreeCodec } from "../boolean-tree/codec";
import { FactLeafCodec } from "../fact/condition-codec";
import type { Condition, ConditionLeaf, ProbeLeaf } from "./condition";
import { findProbeSchema } from "./probe";

// JSON: fact leaves + ["probe", name, ...args]; probe tag signals live device I/O vs cached facts

const isConditionLeaf = (u: unknown): u is ConditionLeaf => typeof u === "object" && u !== null && "type" in u;

const validateProbe = (u: unknown[], c: t.Context): t.Validation<ProbeLeaf> => {
  const [, name, ...args] = u;
  if (typeof name !== "string") return t.failure(u, c, "probe requires a probe name");

  const schema = findProbeSchema(name);
  if (!schema) return t.failure(u, c, `Unknown probe: "${name}"`);

  if (args.length !== schema.args.length) {
    return t.failure(u, c, `probe "${name}" requires ${schema.args.length} argument(s), got ${args.length}`);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const spec = schema.args[i];
    if (typeof arg !== "string")
      return t.failure(u, c, `probe "${name}": ${spec?.label ?? `argument ${i}`} must be a string`);
    if (spec?.options && !spec.options.includes(arg)) {
      return t.failure(u, c, `probe "${name}": ${spec.label} must be one of ${spec.options.join(" | ")}`);
    }
  }

  return t.success({ type: "probe" as const, name: schema.name, args: args as string[] });
};

const validateConditionLeaf = (u: unknown, c: t.Context): t.Validation<ConditionLeaf> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [tag, ...args]");

  return u[0] === "probe" ? validateProbe(u, c) : (FactLeafCodec.validate(u, c) as t.Validation<ConditionLeaf>);
};

const encodeConditionLeaf = (leaf: ConditionLeaf): unknown[] =>
  leaf.type === "probe" ? ["probe", leaf.name, ...leaf.args] : FactLeafCodec.encode(leaf);

const ConditionLeafCodec = new t.Type<ConditionLeaf, unknown[], unknown>(
  "ConditionLeaf",
  isConditionLeaf,
  validateConditionLeaf,
  encodeConditionLeaf,
);

export const ConditionCodec: t.Type<Condition, unknown[], unknown> = booleanTreeCodec("Condition", ConditionLeafCodec);
