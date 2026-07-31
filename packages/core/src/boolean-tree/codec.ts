import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { match } from "ts-pattern";
import type { BooleanTree } from "./tree";

// ["and", ...] | ["or", ...] | ["not", x] | leaf codec; tags are reserved keywords

const isTree = (u: unknown): u is BooleanTree<never> => typeof u === "object" && u !== null && "type" in u;

export const booleanTreeCodec = <Leaf>(
  name: string,
  leafCodec: t.Type<Leaf, unknown[], unknown>,
): t.Type<BooleanTree<Leaf>, unknown[], unknown> => {
  const validate = (u: unknown, c: t.Context): t.Validation<BooleanTree<Leaf>> => {
    if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [tag, ...args]");

    const [tag, ...args] = u;
    if (typeof tag !== "string") return t.failure(u, c, "First element must be a string (tag)");

    return match<string, t.Validation<BooleanTree<Leaf>>>(tag)
      .with("and", "or", (connective) => {
        if (args.length === 0) return t.failure(u, c, `${connective} requires at least one operand`);

        const nodes: BooleanTree<Leaf>[] = [];
        for (let i = 0; i < args.length; i++) {
          const result = validate(args[i], [...c, { key: `[${i + 1}]`, type: codec, actual: args[i] }]);
          if (E.isLeft(result)) return result;
          nodes.push(result.right);
        }

        return t.success({ type: connective as "and" | "or", nodes });
      })
      .with("not", () => {
        const result = validate(args[0], [...c, { key: "[1]", type: codec, actual: args[0] }]);
        if (E.isLeft(result)) return result;

        return t.success({ type: "not" as const, node: result.right });
      })
      .otherwise(() =>
        E.map((value: Leaf): BooleanTree<Leaf> => ({ type: "leaf", leaf: value }))(leafCodec.validate(u, c)),
      );
  };

  const encode = (tree: BooleanTree<Leaf>): unknown[] =>
    match(tree)
      .with({ type: "leaf" }, ({ leaf }) => leafCodec.encode(leaf))
      .with({ type: "and" }, ({ nodes }) => ["and", ...nodes.map(encode)])
      .with({ type: "or" }, ({ nodes }) => ["or", ...nodes.map(encode)])
      .with({ type: "not" }, ({ node }) => ["not", encode(node)])
      .exhaustive();

  const codec: t.Type<BooleanTree<Leaf>, unknown[], unknown> = new t.Type<BooleanTree<Leaf>, unknown[], unknown>(
    name,
    (u): u is BooleanTree<Leaf> => isTree(u),
    validate,
    encode,
  );

  return codec;
};
