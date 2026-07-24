import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { compileLevels } from "./compile";
import type { RecoveryLevel } from "./model";

describe("recovery/compile", () => {
  it("compiles grace, predicate and retry policy for every level", () => {
    const levels: readonly RecoveryLevel[] = [
      {
        grace: "1m",
        predicate: { type: "ref", name: "suitest_camera_connected" },
        pipeline: { type: "workflow", workflowName: "restart" },
        retry: [
          ["constantDelay", "10s"],
          ["limitRetries", 3],
        ],
      },
    ];

    const result = compileLevels(levels);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toHaveLength(1);
      expect(result.right[0]?.graceMs).toBe(60_000);
      expect(result.right[0]?.pipeline).toStrictEqual({ type: "workflow", workflowName: "restart" });
      expect(result.right[0]?.predicate((name) => ({ suitest_camera_connected: true })[name])).toBe(true);
    }
  });

  it("fails fast when a level's retry policy is malformed", () => {
    const levels: readonly RecoveryLevel[] = [
      {
        grace: "1m",
        predicate: { type: "ref", name: "x" },
        pipeline: { type: "workflow", workflowName: "y" },
        retry: [],
      },
    ];

    const result = compileLevels(levels);
    expect(E.isLeft(result)).toBe(true);
  });
});
