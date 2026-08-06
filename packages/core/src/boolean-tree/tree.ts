import { pipe } from "fp-ts/function";
import type { Predicate } from "fp-ts/Predicate";
import * as RTE from "fp-ts/ReaderTaskEither";
import { match } from "ts-pattern";

// Polymorphic tree: Leafs can be predicates or probes, enabling reuse across workflows/tripwires

export type BooleanTree<Leaf> =
  | { readonly type: "leaf"; readonly leaf: Leaf }
  | { readonly type: "and"; readonly nodes: readonly BooleanTree<Leaf>[] }
  | { readonly type: "or"; readonly nodes: readonly BooleanTree<Leaf>[] }
  | { readonly type: "not"; readonly node: BooleanTree<Leaf> };

export const leaf = <Leaf>(value: Leaf): BooleanTree<Leaf> => ({ type: "leaf", leaf: value });

export const and = <Leaf>(nodes: readonly BooleanTree<Leaf>[]): BooleanTree<Leaf> => ({ type: "and", nodes });

export const or = <Leaf>(nodes: readonly BooleanTree<Leaf>[]): BooleanTree<Leaf> => ({ type: "or", nodes });

export const not = <Leaf>(node: BooleanTree<Leaf>): BooleanTree<Leaf> => ({ type: "not", node });

// Compile once, reuse for each evaluation; and/or empty are neutral elements
export const compile =
  <Leaf, A>(compileLeaf: (value: Leaf) => Predicate<A>) =>
  (tree: BooleanTree<Leaf>): Predicate<A> =>
    match(tree)
      .with({ type: "leaf" }, ({ leaf: value }) => compileLeaf(value))
      .with({ type: "and" }, ({ nodes }) => {
        const compiled = nodes.map(compile(compileLeaf));
        return (a: A) => compiled.every((p) => p(a));
      })
      .with({ type: "or" }, ({ nodes }) => {
        const compiled = nodes.map(compile(compileLeaf));
        return (a: A) => compiled.some((p) => p(a));
      })
      .with({ type: "not" }, ({ node }) => {
        const compiled = compile(compileLeaf)(node);
        return (a: A) => !compiled(a);
      })
      .exhaustive();

// Effectful variant with short-circuit evaluation (avoids unnecessary ADB calls)
export const compileEffect =
  <Leaf, Env, Err>(compileLeaf: (value: Leaf) => RTE.ReaderTaskEither<Env, Err, boolean>) =>
  (tree: BooleanTree<Leaf>): RTE.ReaderTaskEither<Env, Err, boolean> => {
    const go = compileEffect(compileLeaf);

    // Sequential & lazy fold (reduce would evaluate all nodes first)
    const sequence = (
      nodes: readonly BooleanTree<Leaf>[],
      index: number,
      stopAt: boolean,
    ): RTE.ReaderTaskEither<Env, Err, boolean> => {
      const node = nodes[index];
      if (!node) return RTE.right(!stopAt);

      return pipe(
        go(node),
        RTE.flatMap((ok) => (ok === stopAt ? RTE.right(stopAt) : sequence(nodes, index + 1, stopAt))),
      );
    };

    return match(tree)
      .with({ type: "leaf" }, ({ leaf: value }) => compileLeaf(value))
      .with({ type: "and" }, ({ nodes }) => sequence(nodes, 0, false))
      .with({ type: "or" }, ({ nodes }) => sequence(nodes, 0, true))
      .with({ type: "not" }, ({ node }) =>
        pipe(
          go(node),
          RTE.map((ok) => !ok),
        ),
      )
      .exhaustive();
  };
