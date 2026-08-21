// INV-11 e le proprietà di M-5. Il lab di prova è quello vero in miniatura: una CU con quattro
// TV, e due camere appese via `Observes` a due di quelle TV.

import * as Instant from "@lab/kernel/Instant";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as Topology from "@lab/registry/domain/Topology";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as CorrelationRule from "./CorrelationRule";
import { correlateOutage, type OutageSnapshot } from "./correlateOutage";
import * as RecoveryTarget from "./RecoveryTarget";

const t = (seconds: number) => Instant.fromEpochMillis(seconds * 1_000);

const build = (draft: Device.Draft, parent?: Device.Device, relation?: "DependsOn" | "Observes"): Device.Device => {
  const created = Device.register(draft, t(0));
  if (E.isLeft(created)) throw new Error(created.left._tag);
  if (!parent || !relation) return created.right.state;
  const attached = Device.attach(created.right.state, parent, relation, t(0));
  if (E.isLeft(attached)) throw new Error(attached.left._tag);
  return attached.right.state;
};

const cu = build({ id: DeviceId.of("cu-1"), kind: "ControlUnit", unitType: O.some("candybox") });
const tvs = ["tv-1", "tv-2", "tv-3", "tv-4"].map((id) => build({ id: DeviceId.of(id), kind: "Tv" }, cu, "DependsOn"));
const cameras = ["cam-1", "cam-2"].map((id, index) =>
  build({ id: DeviceId.of(id), kind: "AndroidCamera" }, tvs[index] as Device.Device, "Observes"),
);
const all = [cu, ...tvs, ...cameras];
const topology = Topology.fromDevices(all);

const snapshot = (
  down: ReadonlyArray<readonly [Device.Device, number]>,
  excluded: ReadonlyArray<Device.Device> = [],
): OutageSnapshot => ({
  downSince: new Map(down.map(([device, since]) => [device.id, t(since)])),
  correlatable: new Set(all.filter((device) => !excluded.includes(device)).map((device) => device.id)),
});

const keys = (targets: ReadonlyArray<{ target: RecoveryTarget.RecoveryTarget }>) =>
  targets.map((entry) => RecoveryTarget.key(entry.target));

describe("correlateOutage · la CU come colpevole (FL-3)", () => {
  it("tutte le TV giù ⇒ un solo bersaglio cluster, zero bersagli sulle TV", () => {
    const targets = correlateOutage(
      snapshot(tvs.map((tv, index) => [tv, 10 * index] as const)),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(targets)).toEqual(["cluster:cu-1"]);
    expect(RecoveryTarget.actsOn(targets[0]!.target)).toBe(cu.id);
  });

  it("l'outage del cluster comincia quando il quorum è raggiunto, non al primo caduto", () => {
    const targets = correlateOutage(
      snapshot([
        [tvs[0]!, 0],
        [tvs[1]!, 30],
        [tvs[2]!, 90],
        [tvs[3]!, 60],
      ]),
      topology,
      CorrelationRule.allChildren,
    );
    expect(targets[0]!.outageSince).toEqual(t(90));
  });

  it("con MinChildren il quorum è l'istante del figlio che lo completa", () => {
    const targets = correlateOutage(
      snapshot([
        [tvs[0]!, 0],
        [tvs[1]!, 30],
        [tvs[2]!, 90],
      ]),
      topology,
      CorrelationRule.minChildren(2),
    );
    expect(targets[0]!.outageSince).toEqual(t(30));
  });

  it("meno figli del quorum ⇒ nessun cluster, ogni TV è un guasto suo", () => {
    const targets = correlateOutage(
      snapshot([
        [tvs[0]!, 0],
        [tvs[1]!, 30],
      ]),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(targets)).toEqual(["device:tv-1", "device:tv-2"]);
  });

  it("se è la CU stessa a essere giù la regola non si applica: i figli sono danno collaterale", () => {
    const targets = correlateOutage(
      snapshot([
        [cu, 5],
        [tvs[0]!, 0],
      ]),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(targets)).toEqual(["cluster:cu-1"]);
    expect(targets[0]!.outageSince).toEqual(t(5));
  });

  it("la sola CU giù, senza figli giù, è un device e non un cluster", () => {
    const targets = correlateOutage(snapshot([[cu, 5]]), topology, CorrelationRule.allChildren);
    expect(keys(targets)).toEqual(["device:cu-1"]);
  });
});

describe("correlateOutage · gli archi che non si attraversano (INV-11, NF-2)", () => {
  it("camere giù appese via Observes non producono mai un bersaglio sulla CU (FATTO-3)", () => {
    const targets = correlateOutage(
      snapshot(cameras.map((camera) => [camera, 0] as const)),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(targets)).toEqual(["device:cam-1", "device:cam-2"]);
  });

  it("una TV non correlabile esce dal conto: il quorum si raggiunge lo stesso", () => {
    const targets = correlateOutage(
      snapshot(
        [tvs[0]!, tvs[1]!, tvs[2]!].map((tv) => [tv, 0] as const),
        [tvs[3] as Device.Device],
      ),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(targets)).toEqual(["cluster:cu-1"]);
  });

  it("una CU non correlabile non fa da hub: i figli restano guasti singoli", () => {
    const targets = correlateOutage(
      snapshot(
        tvs.map((tv) => [tv, 0] as const),
        [cu],
      ),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(targets)).toEqual(["device:tv-1", "device:tv-2", "device:tv-3", "device:tv-4"]);
  });
});

describe("correlateOutage · proprietà (M-5)", () => {
  // Su ogni sottoinsieme possibile di device giù: bersagli a due a due disgiunti, e ogni device
  // giù reso conto da esattamente un bersaglio. 128 combinazioni, esaustive e deterministiche.
  // Nota sulla parola "esattamente": i membri di un cluster includono la CU anche quando la CU
  // risponde, perché è il device su cui si *agisce* e INV-1 deve impedire che qualcun altro apra
  // una sessione su di lei nel frattempo. La copertura si legge quindi sui device giù: nessuno
  // scoperto, nessuno contato due volte.
  it("i bersagli sono disgiunti e ogni device giù è reso conto una volta sola", () => {
    for (let mask = 0; mask < 2 ** all.length; mask++) {
      const downDevices = all.filter((_, index) => (mask >> index) & 1);
      const targets = correlateOutage(
        snapshot(downDevices.map((device) => [device, 0] as const)),
        topology,
        CorrelationRule.allChildren,
      );

      const covered: DeviceId.DeviceId[] = [];
      for (const entry of targets) covered.push(...[...RecoveryTarget.members(entry.target)]);
      expect(new Set(covered).size, `maschera ${mask}: bersagli sovrapposti`).toBe(covered.length);
      const down = new Set(downDevices.map((device) => device.id));
      expect(covered.filter((id) => down.has(id)).sort(), `maschera ${mask}: copertura`).toEqual([...down].sort());
      // L'unico device coperto senza essere giù può essere una CU che fa da hub.
      expect(
        covered.filter((id) => !down.has(id)),
        `maschera ${mask}: coperti di troppo`,
      ).toEqual(covered.filter((id) => !down.has(id) && id === cu.id));
    }
  });

  it("l'ordine di uscita è deterministico, non quello di iterazione di un Set", () => {
    const first = correlateOutage(
      snapshot([
        [cameras[1]!, 0],
        [cameras[0]!, 0],
        [tvs[3]!, 0],
      ]),
      topology,
      CorrelationRule.allChildren,
    );
    const second = correlateOutage(
      snapshot([
        [tvs[3]!, 0],
        [cameras[0]!, 0],
        [cameras[1]!, 0],
      ]),
      topology,
      CorrelationRule.allChildren,
    );
    expect(keys(first)).toEqual(keys(second));
    expect(keys(first)).toEqual(["device:cam-1", "device:cam-2", "device:tv-4"]);
  });
});
