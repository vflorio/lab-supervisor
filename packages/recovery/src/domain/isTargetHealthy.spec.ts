// INV-8 e il vincolo su `since` di INV-5, sulla sola funzione che decide se un bersaglio è sano.

import * as Instant from "@lab/kernel/Instant";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as CorrelationRule from "./CorrelationRule";
import { isTargetHealthy } from "./isTargetHealthy";
import * as RecoveryTarget from "./RecoveryTarget";

const t = (seconds: number) => Instant.fromEpochMillis(seconds * 1_000);
const cu = DeviceId.of("cu-1");
const tvs = ["tv-1", "tv-2", "tv-3", "tv-4"].map(DeviceId.of);
const cluster = RecoveryTarget.controlUnitCluster(cu, [tvs[0]!, tvs[1]!, tvs[2]!, tvs[3]!]);

const health = (faces: ReadonlyArray<readonly [DeviceId.DeviceId, "up" | "down", number]>) =>
  HealthSnapshot.of(
    faces.map(([deviceId, state, since]) => ({
      ref: FacetRef.make(deviceId, "Reachable" as Facet),
      status: state === "up" ? HealthStatus.healthy(t(since)) : HealthStatus.unhealthy(t(since)),
      consecutive: 0,
      pending: O.none,
    })),
  );

const allUp = (since: number) => health([cu, ...tvs].map((deviceId) => [deviceId, "up", since] as const));

describe("isTargetHealthy · un device", () => {
  const target = RecoveryTarget.device(tvs[0]!);

  it("senza `notBefore` basta che la faccia sia sana (INV-7)", () => {
    const snapshot = health([[tvs[0]!, "up", 10]]);
    expect(isTargetHealthy(target, "Reachable", CorrelationRule.allChildren, snapshot, O.none)).toBe(true);
  });

  it("con `notBefore` la guarigione dev'essere posteriore al dispaccio (INV-5)", () => {
    const stale = health([[tvs[0]!, "up", 10]]);
    expect(isTargetHealthy(target, "Reachable", CorrelationRule.allChildren, stale, O.some(t(100)))).toBe(false);
    const fresh = health([[tvs[0]!, "up", 110]]);
    expect(isTargetHealthy(target, "Reachable", CorrelationRule.allChildren, fresh, O.some(t(100)))).toBe(true);
  });

  it("una faccia mai sondata non è sana", () => {
    expect(isTargetHealthy(target, "Reachable", CorrelationRule.allChildren, HealthSnapshot.empty, O.none)).toBe(false);
  });
});

describe("isTargetHealthy · un cluster (INV-8)", () => {
  it('"la CU risponde al ping" non è mai, da solo, una guarigione', () => {
    const snapshot = health([[cu, "up", 110], ...tvs.map((tv) => [tv, "down", 0] as const)]);
    expect(isTargetHealthy(cluster, "Reachable", CorrelationRule.allChildren, snapshot, O.some(t(100)))).toBe(false);
  });

  it("la CU giù non basta mai, per quanti figli siano tornati", () => {
    const snapshot = health([[cu, "down", 0], ...tvs.map((tv) => [tv, "up", 110] as const)]);
    expect(isTargetHealthy(cluster, "Reachable", CorrelationRule.allChildren, snapshot, O.some(t(100)))).toBe(false);
  });

  it("guarito quando la CU è sana e la regola non la incolpa più", () => {
    expect(isTargetHealthy(cluster, "Reachable", CorrelationRule.allChildren, allUp(110), O.some(t(100)))).toBe(true);
  });

  it("anche per i dipendenti il ritorno dev'essere posteriore al dispaccio (INV-5)", () => {
    const snapshot = health([[cu, "up", 110], ...tvs.map((tv) => [tv, "up", 10] as const)]);
    expect(isTargetHealthy(cluster, "Reachable", CorrelationRule.allChildren, snapshot, O.some(t(100)))).toBe(false);
  });

  it("con MinChildren bastano abbastanza dipendenti tornati sani", () => {
    const snapshot = health([
      [cu, "up", 110],
      [tvs[0]!, "up", 110],
      [tvs[1]!, "up", 110],
      [tvs[2]!, "down", 0],
      [tvs[3]!, "down", 0],
    ]);
    expect(isTargetHealthy(cluster, "Reachable", CorrelationRule.minChildren(3), snapshot, O.some(t(100)))).toBe(true);
    expect(isTargetHealthy(cluster, "Reachable", CorrelationRule.minChildren(2), snapshot, O.some(t(100)))).toBe(false);
  });
});
