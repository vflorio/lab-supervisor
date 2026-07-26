import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { NotifyRuleCodec } from "./codec";

describe("notify/codec", () => {
  it("decodes a slack notify rule", () => {
    const json = {
      type: ["slack"],
      channel: "#lab-supervisor",
      message: "Camera recovery failed",
      policy: ["immediate", "exhausted"],
    };

    const result = NotifyRuleCodec.decode(json);
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toStrictEqual({
        type: { type: "slack" },
        channel: "#lab-supervisor",
        message: "Camera recovery failed",
        policy: ["immediate", "exhausted"],
      });
    }
  });

  it("fails on an unknown target tag", () => {
    const result = NotifyRuleCodec.decode({
      type: ["webhook"],
      channel: "#lab-supervisor",
      message: "x",
      policy: ["immediate"],
    });
    expect(E.isLeft(result)).toBe(true);
  });

  it("fails on an unknown lifecycle value", () => {
    const result = NotifyRuleCodec.decode({
      type: ["slack"],
      channel: "#lab-supervisor",
      message: "x",
      policy: ["succeeded"],
    });
    expect(E.isLeft(result)).toBe(true);
  });
});
