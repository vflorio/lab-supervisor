import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as Config from "./config";

const validConfig = {
  activationSchedule: {
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    from: "09:00",
    to: "18:00",
  },
  suitest: {
    baseUrl: "https://the.suite.st/api/public/v4",
    tokenId: "token-id",
    tokenPassword: "token-password",
  },
  slack: { active: false, botToken: "token" },
  tracking: {
    adb: { policy: [["constantDelay", "5s"]] },
    suitestCamera: { policy: [["constantDelay", "20s"]] },
    suitestControlUnit: { policy: [["constantDelay", "20s"]] },
    suitestDevice: { policy: [["constantDelay", "20s"]] },
  },
  adb: { port: 5555, waitForDeviceTimeout: "90s" },
  log: { level: "debug" },
  workflows: [],
  trpc: { port: 3001, hostname: "127.0.0.1" },
  registry: { dbPath: "data/device-registry.json" },
};

describe("config", () => {
  it("decodes a full valid config including the tracking section", () => {
    const result = Config.decode(validConfig);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.tracking).toEqual(validConfig.tracking);
    }
  });

  it("fails when the tracking section is missing", () => {
    const { tracking: _tracking, ...withoutTracking } = validConfig;
    const result = Config.decode(withoutTracking);
    expect(E.isLeft(result)).toBe(true);
  });

  it("fails when a per-domain tracking policy is malformed", () => {
    const malformed = { ...validConfig, tracking: { ...validConfig.tracking, adb: { policy: "not-a-policy" } } };
    const result = Config.decode(malformed);
    expect(E.isLeft(result)).toBe(true);
  });
});

describe("Config.applyPatch", () => {
  const decoded = E.getOrElseW(() => {
    throw new Error("validConfig must decode");
  })(Config.decode(validConfig));

  it("replaces only the fields present in the patch, leaving the rest untouched", () => {
    const next = Config.applyPatch({ adb: { port: decoded.adb.port, waitForDeviceTimeout: "5m" } })(decoded);
    expect(next.adb).toEqual({ port: decoded.adb.port, waitForDeviceTimeout: "5m" });
    expect(next.trpc).toEqual(decoded.trpc);
    expect(next.workflows).toEqual(decoded.workflows);
  });

  it("merges suitest/slack field-by-field, never dropping credentials", () => {
    const next = Config.applyPatch({ suitest: { baseUrl: "https://new" }, slack: { active: true } })(decoded);
    expect(next.suitest).toEqual({ ...decoded.suitest, baseUrl: "https://new" });
    expect(next.slack).toEqual({ ...decoded.slack, active: true });
  });

  it("is a no-op for fields absent from the patch", () => {
    expect(Config.applyPatch({})(decoded)).toEqual(decoded);
  });
});
