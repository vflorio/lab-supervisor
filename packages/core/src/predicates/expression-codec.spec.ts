import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { PredicateExpressionCodec } from "./expression-codec";

describe("predicates/expression-codec", () => {
  it("decodes a ref", () => {
    const result = PredicateExpressionCodec.decode(["ref", "suitest_camera_connected"]);
    expect(result).toStrictEqual(E.right({ type: "ref", name: "suitest_camera_connected" }));
  });

  it("decodes nested or/not", () => {
    const json = ["or", ["ref", "suitest_camera_recording"], ["not", ["ref", "suitest_control_unit_online"]]];
    const result = PredicateExpressionCodec.decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toStrictEqual({
        type: "or",
        exprs: [
          { type: "ref", name: "suitest_camera_recording" },
          { type: "not", expr: { type: "ref", name: "suitest_control_unit_online" } },
        ],
      });
    }
  });

  it("rejects an empty and/or", () => {
    const result = PredicateExpressionCodec.decode(["and"]);
    expect(E.isLeft(result)).toBe(true);
  });

  it("round-trips through encode", () => {
    const expr = {
      type: "and" as const,
      exprs: [
        { type: "ref" as const, name: "a" },
        { type: "equals" as const, name: "b", value: "ready" },
      ],
    };
    expect(PredicateExpressionCodec.decode(PredicateExpressionCodec.encode(expr))).toStrictEqual(E.right(expr));
  });
});
