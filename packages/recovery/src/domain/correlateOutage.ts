// Il domain service che sceglie i bersagli veri: dato chi è giù, decide dove sta il guasto.
// Se una CU cade, le TV che pilota risultano irraggiungibili di conseguenza — è un guasto solo,
// non cinque (FATTO-4) — e riavviare le TV non ripara nulla.
//
// Tre decisioni già prese, da non rimettere in discussione:
//  - si attraversano **solo** archi `DependsOn`, mai `Observes` (INV-11): tre camere giù appese
//    a tre TV della stessa CU sono tre guasti, non un reboot della CU (FATTO-3, NF-2);
//  - numeratore e denominatore contano gli stessi figli, i soli correlabili (INV-11): un figlio
//    sotto maintenance hold esce dal conto, non fa scattare né impedisce una correlazione;
//  - **niente finestra temporale**. Non si richiede che i figli cadano "entro 30 secondi l'uno
//    dall'altro": un device ancora giù è ancora giù, e la parentela conta più della coincidenza.
//
// L'outage di un cluster comincia quando il **quorum** è stato raggiunto — al più tardo fra gli
// inizi di outage dei figli necessari a soddisfare la regola — non al primo che è caduto (FL-3).
// Se è la CU stessa a essere giù la regola non si applica affatto e l'inizio è il suo.
//
// Proprietà che vale la pena tenere a mente leggendo il codice: i bersagli restituiti sono a due
// a due disgiunti sui device e coprono **esattamente** l'insieme dei device giù. L'ordine di
// uscita è deterministico, mai dipendente dall'iterazione di un `Set`.

import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import * as Topology from "@lab/registry/domain/Topology";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as CorrelationRule from "./CorrelationRule";
import * as RecoveryTarget from "./RecoveryTarget";

export type OutageSnapshot = {
  readonly downSince: ReadonlyMap<DeviceId, Instant>;
  readonly correlatable: ReadonlySet<DeviceId>;
};

export type CorrelatedTarget = {
  readonly target: RecoveryTarget.RecoveryTarget;
  readonly outageSince: Instant;
};

// Le uniche CU che vale la pena esaminare: quelle giù con dei dipendenti, e quelle che hanno
// almeno un figlio giù. Ricavarle dai device giù evita di chiedere alla topologia un elenco di
// hub che non le serve tenere.
const candidateUnits = (snapshot: OutageSnapshot, topology: Topology.Topology): ReadonlyArray<DeviceId> => {
  const units = new Set<DeviceId>();
  for (const id of snapshot.downSince.keys()) {
    if (Topology.dependentsOf(topology, id).length > 0) units.add(id);
    const parent = Topology.parentOf(topology, id);
    if (O.isSome(parent) && parent.value.relation === "DependsOn") units.add(parent.value.parent);
  }
  return [...units].sort();
};

const quorumReachedAt = (
  downSince: ReadonlyMap<DeviceId, Instant>,
  downChildren: ReadonlyArray<DeviceId>,
  rule: CorrelationRule.CorrelationRule,
  total: number,
): Instant => {
  const instants = downChildren
    .flatMap((id) => (downSince.has(id) ? [downSince.get(id) as Instant] : []))
    .sort((a, b) => Instants.Ord.compare(a, b));
  const quorum = Math.min(CorrelationRule.quorumSize(rule, total), instants.length);
  return instants[Math.max(0, quorum - 1)] as Instant;
};

export const correlateOutage = (
  snapshot: OutageSnapshot,
  topology: Topology.Topology,
  rule: CorrelationRule.CorrelationRule,
): ReadonlyArray<CorrelatedTarget> => {
  const isDown = (id: DeviceId) => snapshot.downSince.has(id);
  const isCorrelatable = (id: DeviceId) => snapshot.correlatable.has(id);
  const claimed = new Set<DeviceId>();
  const targets: CorrelatedTarget[] = [];

  for (const unitId of candidateUnits(snapshot, topology)) {
    // Una CU che non è correlabile (in manutenzione, o fuori monitoraggio) non fa da hub: i suoi
    // figli restano guasti singoli, e lei con loro.
    if (!isCorrelatable(unitId)) continue;

    const children = Topology.dependentsOf(topology, unitId).filter(isCorrelatable);
    const downChildren = children.filter(isDown);
    const unitDown = isDown(unitId);

    // Sussunzione (FATTO-4): se è la CU a essere giù, i figli sono danno collaterale e la regola
    // non si applica. Non si aprono mai sessioni sui figli in quel caso.
    if (!unitDown && !CorrelationRule.blames(rule, downChildren.length, children.length)) continue;
    // La sola CU giù, senza figli giù, non è un cluster: è un device.
    if (!RA.isNonEmpty(downChildren)) continue;

    targets.push({
      target: RecoveryTarget.controlUnitCluster(unitId, downChildren),
      outageSince: unitDown
        ? (snapshot.downSince.get(unitId) as Instant)
        : quorumReachedAt(snapshot.downSince, downChildren, rule, children.length),
    });
    claimed.add(unitId);
    for (const child of downChildren) claimed.add(child);
  }

  for (const [id, since] of snapshot.downSince)
    if (!claimed.has(id)) targets.push({ target: RecoveryTarget.device(id), outageSince: since });

  return [...targets].sort((a, b) => RecoveryTarget.key(a.target).localeCompare(RecoveryTarget.key(b.target)));
};
