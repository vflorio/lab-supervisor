import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";

export const moveAt =
  <A>(index: number, delta: number) =>
  (as: readonly A[]): readonly A[] =>
    pipe(
      O.Do,
      O.apS("a", RA.lookup(index)(as)),
      O.apS("b", RA.lookup(index + delta)(as)),
      O.flatMap(({ a, b }) => pipe(as, RA.updateAt(index, b), O.flatMap(RA.updateAt(index + delta, a)))),
      O.getOrElse((): readonly A[] => as),
    );

export const removeAt =
  <A>(index: number) =>
  (as: readonly A[]): readonly A[] =>
    pipe(
      as,
      RA.deleteAt(index),
      O.getOrElse((): readonly A[] => as),
    );
