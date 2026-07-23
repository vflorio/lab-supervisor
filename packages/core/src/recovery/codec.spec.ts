import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { RecoveryPolicyCodec } from "./codec";

describe("recovery/codec", () => {
  it("decodes a recovery policy with escalating levels", () => {
    const json = {
      label: "Recovery A",
      levels: [
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
      expect(result.right.levels).toHaveLength(3);
      expect(result.right.levels[0]?.predicate).toStrictEqual({ type: "ref", name: "suitest_camera_connected" });
    }
  });

  it("fails when a level is missing a required field", () => {
    const result = RecoveryPolicyCodec.decode({
      label: "Recovery A",
      levels: [{ grace: "1m", predicate: ["ref", "x"], pipeline: ["workflow", "y"] }],
    });
    expect(E.isLeft(result)).toBe(true);
  });
});
