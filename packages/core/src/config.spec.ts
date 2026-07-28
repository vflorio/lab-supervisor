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
  activation: { polling: [["constantDelay", "30s"]] },
  tracking: {
    adb: { polling: [["constantDelay", "5s"]] },
    suitestCamera: { polling: [["constantDelay", "20s"]] },
    suitestControlUnit: { polling: [["constantDelay", "20s"]] },
    suitestDevice: { polling: [["constantDelay", "20s"]] },
  },
  adb: { port: 5555, reconnect: [["constantDelay", "400ms"]], waitForDeviceTimeout: "90s" },
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
    const malformed = { ...validConfig, tracking: { ...validConfig.tracking, adb: { polling: "not-a-policy" } } };
    const result = Config.decode(malformed);
    expect(E.isLeft(result)).toBe(true);
  });
});
