import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as BooleanTree from "../boolean-tree/tree";
import * as Expr from "./expression";
import { PredicateExpressionCodec } from "./expression-codec";

describe("predicates/expression-codec", () => {
  it("decodes a ref", () => {
    const result = PredicateExpressionCodec.decode(["ref", "suitest_camera_connected"]);
    expect(result).toStrictEqual(E.right(Expr.ref("suitest_camera_connected")));
  });

  it("decodes nested or/not", () => {
    const json = ["or", ["ref", "suitest_camera_recording"], ["not", ["ref", "suitest_control_unit_online"]]];
    const result = PredicateExpressionCodec.decode(json);

    expect(result).toStrictEqual(
      E.right(
        BooleanTree.or([
          Expr.ref("suitest_camera_recording"),
          BooleanTree.not(Expr.ref("suitest_control_unit_online")),
        ]),
      ),
    );
  });

  it("rejects an empty and/or", () => {
    const result = PredicateExpressionCodec.decode(["and"]);
    expect(E.isLeft(result)).toBe(true);
  });

  it("rejects an unknown leaf tag", () => {
    expect(E.isLeft(PredicateExpressionCodec.decode(["probe", "screenOn"]))).toBe(true);
  });

  it("round-trips through encode", () => {
    const expr = BooleanTree.and([Expr.ref("a"), Expr.equals("b", "ready")]);
    expect(PredicateExpressionCodec.decode(PredicateExpressionCodec.encode(expr))).toStrictEqual(E.right(expr));
  });
});
