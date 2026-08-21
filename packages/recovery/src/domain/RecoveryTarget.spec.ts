// I membri di un bersaglio sono ciò che INV-1 confronta: non "per target", per *device*.

import * as DeviceId from "@lab/registry/domain/DeviceId";
import { describe, expect, it } from "vitest";
import * as RecoveryTarget from "./RecoveryTarget";

const cu = DeviceId.of("cu-1");
const tvA = DeviceId.of("tv-a");
const tvB = DeviceId.of("tv-b");

describe("RecoveryTarget", () => {
  it("un cluster occupa la CU e i suoi dipendenti", () => {
    const cluster = RecoveryTarget.controlUnitCluster(cu, [tvB, tvA]);
    expect([...RecoveryTarget.members(cluster)].sort()).toEqual([cu, tvA, tvB].sort());
    expect(RecoveryTarget.actsOn(cluster)).toBe(cu);
  });

  it("due bersagli che condividono un device non possono convivere (INV-1)", () => {
    const single = RecoveryTarget.device(tvA);
    const cluster = RecoveryTarget.controlUnitCluster(cu, [tvA, tvB]);
    const shared = [...RecoveryTarget.members(single)].filter((id) => RecoveryTarget.involves(cluster, id));
    expect(shared).toEqual([tvA]);
  });

  it("si agisce sulla CU, mai su una TV: riavviare la TV non ripara il ponte", () => {
    expect(RecoveryTarget.actsOn(RecoveryTarget.controlUnitCluster(cu, [tvA]))).toBe(cu);
    expect(RecoveryTarget.actsOn(RecoveryTarget.device(tvA))).toBe(tvA);
  });

  it("i dipendenti sono ordinati: la chiave di un bersaglio non dipende dall'ordine d'ingresso", () => {
    const one = RecoveryTarget.controlUnitCluster(cu, [tvB, tvA]);
    const other = RecoveryTarget.controlUnitCluster(cu, [tvA, tvB]);
    expect(one).toEqual(other);
    expect(RecoveryTarget.key(one)).toBe(RecoveryTarget.key(other));
  });
});
