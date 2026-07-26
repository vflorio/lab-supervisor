import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { RecoveryPolicyCodec } from "./codec";

describe("recovery/codec", () => {
  it("decodes a recovery policy with escalating tripwires", () => {
    const json = {
      label: "Recovery A",
      domain: "suitest-camera",
      tripwires: [
        {
          grace: "1m",
          predicate: ["ref", "suitest_camera_connected"],
          pipeline: ["or", ["workflow", "restart-camera-app"], ["workflow", "reboot-camera"]],
          retry: [
            ["constantDelay", "10s"],
            ["limitRetries", 3],
          ],
        },
        {
          grace: "5m",
          predicate: ["or", ["ref", "suitest_camera_recording"], ["not", ["ref", "suitest_control_unit_online"]]],
          pipeline: ["workflow", "reboot-camera"],
          retry: [
            ["constantDelay", "30s"],
            ["limitRetries", 1],
          ],
        },
        {
          grace: "1h",
          predicate: ["and", ["ref", "suitest_camera_recording"], ["ref", "suitest_camera_streaming"]],
          pipeline: ["workflow", "reboot-camera"],
          retry: [
            ["constantDelay", "1m"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = RecoveryPolicyCodec.decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.tripwires).toHaveLength(3);
      expect(result.right.tripwires[0]?.predicate).toStrictEqual({ type: "ref", name: "suitest_camera_connected" });
    }
  });

  it("decodes an optional notify block on a tripwire", () => {
    const json = {
      label: "Recovery A",
      domain: "suitest-camera",
      tripwires: [
        {
          grace: "10s",
          predicate: ["ref", "suitest_camera_connected"],
          pipeline: ["workflow", "open-chrome"],
          retry: [
            ["constantDelay", "10s"],
            ["limitRetries", 2],
          ],
          notify: [
            {
              type: ["slack"],
              channel: "#lab-supervisor",
              message: "Camera recovery failed",
              policy: ["immediate", "exhausted"],
            },
          ],
        },
      ],
    };

    const result = RecoveryPolicyCodec.decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.tripwires[0]?.notify).toStrictEqual([
        {
          type: { type: "slack" },
          channel: "#lab-supervisor",
          message: { type: "template", message: "Camera recovery failed" },
          policy: ["immediate", "exhausted"],
        },
      ]);
    }
  });

  it("decodes a tripwire without a notify block", () => {
    const result = RecoveryPolicyCodec.decode({
      label: "Recovery A",
      domain: "suitest-camera",
      tripwires: [
        {
          grace: "10s",
          predicate: ["ref", "x"],
          pipeline: ["workflow", "y"],
          retry: [["constantDelay", "10s"]],
        },
      ],
    });
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.tripwires[0]?.notify).toBeUndefined();
    }
  });

  it("fails when a tripwire is missing a required field", () => {
    const result = RecoveryPolicyCodec.decode({
      label: "Recovery A",
      domain: "suitest-camera",
      tripwires: [{ grace: "1m", predicate: ["ref", "x"], pipeline: ["workflow", "y"] }],
    });
    expect(E.isLeft(result)).toBe(true);
  });
});
