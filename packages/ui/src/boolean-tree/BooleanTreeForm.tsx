import { Add, Delete, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { IconButton, MenuItem, Select, type SelectChangeEvent, Stack } from "@mui/material";
import type { ReactNode } from "react";
import type { BooleanTreeOps } from "./types";

// Editor ricorsivo controllato per un albero booleano and/or/not; il leaf e' delegato al
// chiamante (vedi PredicateExpressionForm/PipelineForm per le istanze concrete).
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

// Retag tra leaf/and/or/not: and<->or riusa i figli, and/or->not prende il primo figlio
// (gli altri si perdono, non c'e' un modo sensato di comprimerli in un solo slot),
// leaf/not<->and/or avvolge/spacchetta in un array singleton (i codec rifiutano and/or
// vuoti), *->leaf recupera il primo figlio solo se e' gia' un leaf, altrimenti azzera.
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

  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  const moveItem = (index: number, delta: number) => {
    const target = index + delta;

    if (target < 0 || target >= items.length) return;
    const next = [...items];

    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
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
            <div style={{ flexGrow: 1 }} />
            <IconButton size="small" onClick={() => moveItem(index, -1)} disabled={index === 0}>
              <KeyboardArrowUp fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
              <KeyboardArrowDown fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => removeItem(index)} disabled={items.length === 1}>
              <Delete fontSize="small" />
            </IconButton>
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
