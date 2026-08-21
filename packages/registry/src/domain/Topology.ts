// Proiezione padre/figli, ricalcolabile dall'insieme dei device: non ha stato proprio e non è
// una seconda verità, è la stessa anagrafica letta per archi.
// L'ordine dei figli è deterministico (per `DeviceId`): la correlazione ci costruisce sopra i
// suoi bersagli, e un ordine che dipendesse dall'iterazione di un `Set` renderebbe i test
// verdi o rossi a seconda del giorno (M-5).

import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as OrdModule from "fp-ts/Ord";
import * as RA from "fp-ts/ReadonlyArray";
import type { Attachment } from "./Attachment";
import type { Device } from "./Device";
import * as DeviceId from "./DeviceId";
import type { Relation } from "./Relation";

type Edge = { readonly child: DeviceId.DeviceId; readonly relation: Relation };

const byChildId: OrdModule.Ord<Edge> = OrdModule.contramap((edge: Edge) => edge.child)(DeviceId.Ord);

export type Topology = {
  readonly parents: ReadonlyMap<DeviceId.DeviceId, Attachment>;
  readonly children: ReadonlyMap<DeviceId.DeviceId, ReadonlyArray<Edge>>;
};

export const empty: Topology = { parents: new Map(), children: new Map() };

export const fromDevices = (devices: ReadonlyArray<Device>): Topology => {
  const parents = new Map<DeviceId.DeviceId, Attachment>();
  const children = new Map<DeviceId.DeviceId, Edge[]>();

  for (const device of devices) {
    if (O.isNone(device.attachment)) continue;
    const attachment = device.attachment.value;
    parents.set(device.id, attachment);
    const edges = children.get(attachment.parent) ?? [];
    edges.push({ child: device.id, relation: attachment.relation });
    children.set(attachment.parent, edges);
  }

  const ordered = new Map<DeviceId.DeviceId, ReadonlyArray<Edge>>();
  for (const [parent, edges] of children) ordered.set(parent, pipe(edges, RA.sort(byChildId)));

  return { parents, children: ordered };
};

export const parentOf = (topology: Topology, id: DeviceId.DeviceId): O.Option<Attachment> =>
  O.fromNullable(topology.parents.get(id));

export const childrenOf = (
  topology: Topology,
  id: DeviceId.DeviceId,
  relation: Relation,
): ReadonlyArray<DeviceId.DeviceId> =>
  pipe(
    topology.children.get(id) ?? [],
    RA.filter((edge) => edge.relation === relation),
    RA.map((edge) => edge.child),
  );

// I figli che *dipendono* dalla CU: le TV che pilota, mai le camere che le inquadrano
// (FATTO-3, INV-11). È il solo insieme che la correlazione ha il diritto di guardare.
export const dependentsOf = (topology: Topology, unitId: DeviceId.DeviceId): ReadonlyArray<DeviceId.DeviceId> =>
  childrenOf(topology, unitId, "DependsOn");
