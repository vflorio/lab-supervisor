import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { BooleanTreeOps } from "./types";

// Renderer ricorsivo readonly per un albero booleano and/or/not; il leaf e' delegato al chiamante.
export interface BooleanTreeViewProps<Node, Leaf> {
  readonly value: Node;
  readonly ops: BooleanTreeOps<Node, Leaf>;
  readonly renderLeaf: (leaf: Leaf) => ReactNode;
}

interface JunctionProps<Node, Leaf> {
  readonly label: string;
  readonly items: readonly Node[];
  readonly ops: BooleanTreeOps<Node, Leaf>;
  readonly renderLeaf: (leaf: Leaf) => ReactNode;
}

function Junction<Node, Leaf>({ label, items, ops, renderLeaf }: JunctionProps<Node, Leaf>) {
  return (
    <Stack sx={{ gap: 0.5, pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nodo sola lettura, nessun id
        <Stack key={index} direction="row" sx={{ gap: 0.75, alignItems: "flex-start" }}>
          {index > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {label}
            </Typography>
          )}
          <BooleanTreeView value={item} ops={ops} renderLeaf={renderLeaf} />
        </Stack>
      ))}
    </Stack>
  );
}

export function BooleanTreeView<Node, Leaf>({ value, ops, renderLeaf }: BooleanTreeViewProps<Node, Leaf>) {
  return ops.match<ReactNode>(value, {
    and: (items) => <Junction label="AND" items={items} ops={ops} renderLeaf={renderLeaf} />,
    or: (items) => <Junction label="OR" items={items} ops={ops} renderLeaf={renderLeaf} />,
    not: (child) => (
      <Stack direction="row" sx={{ gap: 0.75, alignItems: "flex-start" }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          NOT
        </Typography>
        <BooleanTreeView value={child} ops={ops} renderLeaf={renderLeaf} />
      </Stack>
    ),
    leaf: renderLeaf,
  });
}
