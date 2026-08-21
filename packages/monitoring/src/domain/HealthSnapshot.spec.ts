import * as Instant from "@lab/kernel/Instant";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import { describe, expect, it } from "vitest";
import * as FacetHealth from "./FacetHealth";
import * as FacetRef from "./FacetRef";
import * as HealthSnapshot from "./HealthSnapshot";
import * as HealthStatus from "./HealthStatus";

const camera = DeviceId.of("cam-1");
const t0 = Instant.fromEpochMillis(0);
const stream = FacetRef.make(camera, "StreamAvailable");
const transport = FacetRef.make(camera, "AdbTransport");

const snapshot = HealthSnapshot.of([
  { ...FacetHealth.initial(stream), status: HealthStatus.unhealthy(t0) },
  { ...FacetHealth.initial(transport), status: HealthStatus.healthy(t0) },
]);

describe("HealthSnapshot", () => {
  it("le due facce di una camera cadono separatamente (FATTO-8)", () => {
    expect(HealthSnapshot.isHealthy(snapshot, transport)).toBe(true);
    expect(HealthSnapshot.isHealthy(snapshot, stream)).toBe(false);
  });

  it("una faccia mai sondata è Unknown, non sana", () => {
    const unseen = FacetRef.make(DeviceId.of("tv-1"), "Reachable");
    expect(HealthSnapshot.statusOf(snapshot, unseen)).toEqual(HealthStatus.unknown);
    expect(HealthSnapshot.isHealthy(snapshot, unseen)).toBe(false);
  });

  it("fotografa tutte le facce di un device, in ordine deterministico", () => {
    expect(HealthSnapshot.facesOf(snapshot, camera).map((health) => health.ref.facet)).toEqual([
      "AdbTransport",
      "StreamAvailable",
    ]);
    expect(HealthSnapshot.facesOf(snapshot, DeviceId.of("tv-1"))).toEqual([]);
  });
});
