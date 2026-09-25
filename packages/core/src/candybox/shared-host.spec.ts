import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import type { DeviceStatus } from "../adapters/suitest";
import type { CandyboxEntry } from "../lab-registry/candybox";
import { type DeviceTopology, detectStuckCandyboxes } from "./shared-host";

const device = (deviceId: string, controlUnitIds: readonly string[]): DeviceTopology => ({
  deviceId,
  controlUnitIds: [...controlUnitIds],
});

// Status live come lo fornirebbe il fact stream (deviceId -> status Suitest)
const statusOf =
  (statuses: Record<string, DeviceStatus>) =>
  (deviceId: string): string | undefined =>
    statuses[deviceId];

const candybox = (over: Partial<CandyboxEntry> & Pick<CandyboxEntry, "id">): CandyboxEntry => ({
  label: over.id,
  controlled: true,
  ip: O.some("192.168.0.15"),
  ...over,
});

const dict = (entries: readonly CandyboxEntry[]): Record<string, CandyboxEntry> =>
  Object.fromEntries(entries.map((e) => [e.id, e]));

describe("detectStuckCandyboxes", () => {
  it("flags a controlled personal-pi whose devices are all OFFLINE", () => {
    const result = detectStuckCandyboxes(
      dict([candybox({ id: "cu-1", label: "Pi_1" })]),
      [device("tv-1", ["cu-1"]), device("tv-2", ["cu-1"])],
      statusOf({ "tv-1": "OFFLINE", "tv-2": "OFFLINE" }),
    );

    expect(result).toEqual([{ id: "cu-1", label: "Pi_1", host: { ip: "192.168.0.15" } }]);
  });

  it("does not flag when at least one device is not OFFLINE", () => {
    const result = detectStuckCandyboxes(
      dict([candybox({ id: "cu-1" })]),
      [device("tv-1", ["cu-1"]), device("tv-2", ["cu-1"])],
      statusOf({ "tv-1": "OFFLINE", "tv-2": "READY" }),
    );

    expect(result).toEqual([]);
  });

  it("treats OFF (intentionally powered off) as not offline", () => {
    const result = detectStuckCandyboxes(
      dict([candybox({ id: "cu-1" })]),
      [device("tv-1", ["cu-1"])],
      statusOf({ "tv-1": "OFF" }),
    );

    expect(result).toEqual([]);
  });

  it("treats unknown status (no fact yet) as not offline", () => {
    const result = detectStuckCandyboxes(dict([candybox({ id: "cu-1" })]), [device("tv-1", ["cu-1"])], statusOf({}));

    expect(result).toEqual([]);
  });

  it("skips candyboxes not under control (maintenance)", () => {
    const result = detectStuckCandyboxes(
      dict([candybox({ id: "cu-1", controlled: false })]),
      [device("tv-1", ["cu-1"])],
      statusOf({ "tv-1": "OFFLINE" }),
    );

    expect(result).toEqual([]);
  });

  it("skips candyboxes without a resolvable SSH ip (non personal-pi)", () => {
    const result = detectStuckCandyboxes(
      dict([candybox({ id: "cu-1", ip: O.none })]),
      [device("tv-1", ["cu-1"])],
      statusOf({ "tv-1": "OFFLINE" }),
    );

    expect(result).toEqual([]);
  });

  it("skips candyboxes with no owned devices", () => {
    const result = detectStuckCandyboxes(
      dict([candybox({ id: "cu-1" })]),
      [device("tv-1", ["cu-other"])],
      statusOf({ "tv-1": "OFFLINE" }),
    );

    expect(result).toEqual([]);
  });

  it("evaluates each candybox independently", () => {
    const result = detectStuckCandyboxes(
      dict([
        candybox({ id: "cu-1", label: "Pi_1", ip: O.some("192.168.0.15") }),
        candybox({ id: "cu-2", label: "Pi_2", ip: O.some("192.168.0.16") }),
      ]),
      [device("tv-1", ["cu-1"]), device("tv-2", ["cu-2"])],
      statusOf({ "tv-1": "OFFLINE", "tv-2": "READY" }),
    );

    expect(result).toEqual([{ id: "cu-1", label: "Pi_1", host: { ip: "192.168.0.15" } }]);
  });
});
