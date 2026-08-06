// Adapter che descrive un albero booleano and/or/not (predicate expression, pipeline, ...)
// a BooleanTreeForm/View senza che quei componenti conoscano la forma concreta di Node/Leaf.
export interface BooleanTreeOps<Node, Leaf> {
  readonly match: <R>(
    node: Node,
    cases: {
      and: (children: readonly Node[]) => R;
      or: (children: readonly Node[]) => R;
      not: (child: Node) => R;
      leaf: (leaf: Leaf) => R;
    },
  ) => R;
  readonly and: (children: readonly Node[]) => Node;
  readonly or: (children: readonly Node[]) => Node;
  readonly not: (child: Node) => Node;
  readonly leaf: (leaf: Leaf) => Node;
}
