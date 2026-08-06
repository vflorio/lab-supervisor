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

export interface ReorderableList<T> {
  readonly update: (index: number, next: T) => void;
  readonly remove: (index: number) => void;
  readonly move: (index: number, delta: number) => void;
  readonly add: (item: T) => void;
}

// Centralizza il pattern update/remove/move/add ripetuto a mano in ScheduleForm/WorkflowForm/
// RecoveryPolicyForm: tutte e quattro le operazioni derivano solo da value/onChange.
export const reorderableList = <T>(
  value: readonly T[],
  onChange: (next: readonly T[]) => void,
): ReorderableList<T> => ({
  update: (index, next) => onChange(value.map((item, i) => (i === index ? next : item))),
  remove: (index) => onChange(removeAt<T>(index)(value)),
  move: (index, delta) => onChange(moveAt<T>(index, delta)(value)),
  add: (item) => onChange([...value, item]),
});
