import { Add } from "@mui/icons-material";
import { IconButton, MenuItem, Select, type SelectChangeEvent, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { DomainSortable } from "../misc/DomainSortable";
import { moveAt, removeAt } from "../misc/sortable";
import type { BooleanTreeOps } from "./types";

export interface BooleanTreeFormProps<Node, Leaf> {
  readonly value: Node;
  readonly onChange: (next: Node) => void;
  readonly ops: BooleanTreeOps<Node, Leaf>;
  readonly defaultLeaf: Leaf;
  readonly renderLeafForm: (leaf: Leaf, onChange: (next: Leaf) => void) => ReactNode;
}

type NodeKind = "leaf" | "and" | "or" | "not";

const kindOf = <Node, Leaf>(ops: BooleanTreeOps<Node, Leaf>, node: Node): NodeKind =>
  ops.match<NodeKind>(node, { and: () => "and", or: () => "or", not: () => "not", leaf: () => "leaf" });

const retag = <Node, Leaf>(ops: BooleanTreeOps<Node, Leaf>, node: Node, kind: NodeKind, defaultLeaf: Leaf): Node => {
  if (kindOf(ops, node) === kind) return node;

  const items = ops.match<readonly Node[]>(node, {
    and: (children) => children,
    or: (children) => children,
    not: (child) => [child],
    leaf: () => [node],
  });

  if (kind === "and") return ops.and(items);
  if (kind === "or") return ops.or(items);
  if (kind === "not") return ops.not(items[0] ?? ops.leaf(defaultLeaf));

  const first = items[0];

  return first !== undefined && kindOf(ops, first) === "leaf" ? first : ops.leaf(defaultLeaf);
};

function KindSelect({ value, onChange }: { value: NodeKind; onChange: (next: NodeKind) => void }) {
  return (
    <Select
      size="small"
      value={value}
      onChange={(event: SelectChangeEvent) => onChange(event.target.value as NodeKind)}
      sx={{ minWidth: 90 }}
    >
      <MenuItem value="leaf">leaf</MenuItem>
      <MenuItem value="and">AND</MenuItem>
      <MenuItem value="or">OR</MenuItem>
      <MenuItem value="not">NOT</MenuItem>
    </Select>
  );
}

interface JunctionProps<Node, Leaf> {
  readonly kindSelect: ReactNode;
  readonly items: readonly Node[];
  readonly onChange: (next: readonly Node[]) => void;
  readonly ops: BooleanTreeOps<Node, Leaf>;
  readonly defaultLeaf: Leaf;
  readonly renderLeafForm: (leaf: Leaf, onChange: (next: Leaf) => void) => ReactNode;
}

function Junction<Node, Leaf>({
  kindSelect,
  items,
  onChange,
  ops,
  defaultLeaf,
  renderLeafForm,
}: JunctionProps<Node, Leaf>) {
  const updateItem = (index: number, next: Node) => onChange(items.map((item, i) => (i === index ? next : item)));

  const removeItem = (index: number) => onChange(removeAt<Node>(index)(items));

  const moveItem = (index: number, delta: number) => onChange(moveAt<Node>(index, delta)(items));

  const addItem = () => onChange([...items, ops.leaf(defaultLeaf)]);

  return (
    <Stack sx={{ gap: 1 }}>
      {kindSelect}
      <Stack sx={{ gap: 2, pl: 2, borderLeft: "2px solid", borderColor: "divider" }}>
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: nodo controllato via value/onChange, nessun id
          <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "flex-start" }}>
            <BooleanTreeForm
              value={item}
              onChange={(next) => updateItem(index, next)}
              ops={ops}
              defaultLeaf={defaultLeaf}
              renderLeafForm={renderLeafForm}
            />
            <DomainSortable
              index={index}
              length={items.length}
              onMove={(delta) => moveItem(index, delta)}
              onRemove={() => removeItem(index)}
              removeDisabled={items.length === 1}
            />
          </Stack>
        ))}
        <IconButton size="small" onClick={addItem} title="Add" sx={{ alignSelf: "flex-start" }}>
          <Add fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
}

export function BooleanTreeForm<Node, Leaf>({
  value,
  onChange,
  ops,
  defaultLeaf,
  renderLeafForm,
}: BooleanTreeFormProps<Node, Leaf>) {
  const kind = kindOf(ops, value);

  const kindSelect = <KindSelect value={kind} onChange={(next) => onChange(retag(ops, value, next, defaultLeaf))} />;

  return ops.match<ReactNode>(value, {
    leaf: (leaf) => (
      <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        {kindSelect}
        {renderLeafForm(leaf, (next) => onChange(ops.leaf(next)))}
      </Stack>
    ),
    not: (child) => (
      <Stack sx={{ gap: 1 }}>
        {kindSelect}
        <Stack sx={{ pl: 2, borderLeft: "2px solid", borderColor: "divider" }}>
          <BooleanTreeForm
            value={child}
            onChange={(next) => onChange(ops.not(next))}
            ops={ops}
            defaultLeaf={defaultLeaf}
            renderLeafForm={renderLeafForm}
          />
        </Stack>
      </Stack>
    ),
    and: (items) => (
      <Junction
        kindSelect={kindSelect}
        items={items}
        onChange={(next) => onChange(ops.and(next))}
        ops={ops}
        defaultLeaf={defaultLeaf}
        renderLeafForm={renderLeafForm}
      />
    ),
    or: (items) => (
      <Junction
        kindSelect={kindSelect}
        items={items}
        onChange={(next) => onChange(ops.or(next))}
        ops={ops}
        defaultLeaf={defaultLeaf}
        renderLeafForm={renderLeafForm}
      />
    ),
  });
}
