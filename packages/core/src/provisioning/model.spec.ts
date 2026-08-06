import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import type { AgentStatus } from "../adapters/adb/provisioning";
import { isHealthy, plan, toFacts } from "./model";

const healthy: AgentStatus = {
  installed: true,
  permissionGranted: true,
  wifiDebuggingEnabled: true,
  usbDebuggingEnabled: true,
  dozeExempt: true,
  serviceRunning: true,
  versionCode: O.some(1),
};

const missing: AgentStatus = {
  installed: false,
  permissionGranted: false,
  wifiDebuggingEnabled: false,
  usbDebuggingEnabled: false,
  dozeExempt: false,
  serviceRunning: false,
  versionCode: O.none,
};

const tags = (status: AgentStatus, expected?: O.Option<number>) =>
  plan(status, expected ?? O.none).map((step) => step._tag);

describe("provisioning plan", () => {
  it("does nothing on a healthy device", () => {
    expect(plan(healthy)).toStrictEqual([]);
  });

  it("runs the full sequence when the app is absent", () => {
    expect(tags(missing)).toStrictEqual(["Install", "Grant", "ExemptDoze", "LaunchOnce"]);
  });

  it("always grants before launching", () => {
    const steps = tags(missing);
    expect(steps.indexOf("Grant")).toBeLessThan(steps.indexOf("LaunchOnce"));
  });

  it("re-grants without reinstalling when only the permission is missing", () => {
    expect(tags({ ...healthy, permissionGranted: false })).toStrictEqual(["Grant", "LaunchOnce"]);
  });

  it("only re-exempts from doze when that is the sole gap", () => {
    expect(tags({ ...healthy, dozeExempt: false })).toStrictEqual(["ExemptDoze"]);
  });

  it("relaunches rather than writing settings when wireless debugging is off", () => {
    expect(tags({ ...healthy, wifiDebuggingEnabled: false })).toStrictEqual(["LaunchOnce"]);
  });

  it("relaunches when the foreground service is down", () => {
    expect(tags({ ...healthy, serviceRunning: false })).toStrictEqual(["LaunchOnce"]);
  });

  it("upgrades and relaunches when the installed versionCode is older", () => {
    expect(tags({ ...healthy, versionCode: O.some(1) }, O.some(2))).toStrictEqual(["Install", "LaunchOnce"]);
  });

  it("leaves a newer installed version alone", () => {
    expect(plan({ ...healthy, versionCode: O.some(3) }, O.some(2))).toStrictEqual([]);
  });

  it("does not upgrade when no expected version is configured", () => {
    expect(plan({ ...healthy, versionCode: O.some(1) }, O.none)).toStrictEqual([]);
  });
});

describe("provisioning status", () => {
  it("is healthy only when every check passes", () => {
    expect(isHealthy(healthy)).toBe(true);
    expect(isHealthy({ ...healthy, usbDebuggingEnabled: false })).toBe(false);
  });

  it("exposes one fact per check plus the aggregate", () => {
    expect(toFacts(healthy)).toStrictEqual({
      agent_installed: true,
      agent_permission_granted: true,
      agent_wifi_debugging: true,
      agent_usb_debugging: true,
      agent_doze_exempt: true,
      agent_service_running: true,
      agent_provisioned: true,
    });
  });

  it("reports the aggregate as false when a single check fails", () => {
    expect(toFacts({ ...healthy, dozeExempt: false }).agent_provisioned).toBe(false);
  });
});
