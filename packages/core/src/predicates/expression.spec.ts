import { describe, expect, it } from "vitest";
import * as Expr from "./expression";

describe("predicates/expression", () => {
  const lookup = (facts: Record<string, boolean | string | number>) => (name: string) => facts[name];

  it("ref: resolves to true only when the predicate is exactly boolean true", () => {
    const predicate = Expr.compile({ type: "ref", name: "suitest_camera_connected" });

    expect(predicate(lookup({ suitest_camera_connected: true }))).toBe(true);
    expect(predicate(lookup({ suitest_camera_connected: false }))).toBe(false);
    expect(predicate(lookup({}))).toBe(false);
  });

  it("equals: compares against a non-boolean value", () => {
    const predicate = Expr.compile({ type: "equals", name: "suitest_status", value: "ready" });

    expect(predicate(lookup({ suitest_status: "ready" }))).toBe(true);
    expect(predicate(lookup({ suitest_status: "offline" }))).toBe(false);
  });

  it("includes: substring match on a stringified value", () => {
    const predicate = Expr.compile({ type: "includes", name: "suitest_message", value: "timeout" });

    expect(predicate(lookup({ suitest_message: "connection timeout after 5s" }))).toBe(true);
    expect(predicate(lookup({ suitest_message: "all good" }))).toBe(false);
  });

  it("and: true only when every sub-expression is true", () => {
    const predicate = Expr.compile({
      type: "and",
      exprs: [
        { type: "ref", name: "suitest_camera_recording" },
        { type: "ref", name: "suitest_camera_streaming" },
      ],
    });

    expect(predicate(lookup({ suitest_camera_recording: true, suitest_camera_streaming: true }))).toBe(true);
    expect(predicate(lookup({ suitest_camera_recording: true, suitest_camera_streaming: false }))).toBe(false);
  });

  it("or + not: true when recording, or the control unit is not online", () => {
    const predicate = Expr.compile({
      type: "or",
      exprs: [
        { type: "ref", name: "suitest_camera_recording" },
        { type: "not", expr: { type: "ref", name: "suitest_control_unit_online" } },
      ],
    });

    expect(predicate(lookup({ suitest_camera_recording: false, suitest_control_unit_online: false }))).toBe(true);
    expect(predicate(lookup({ suitest_camera_recording: false, suitest_control_unit_online: true }))).toBe(false);
    expect(predicate(lookup({ suitest_camera_recording: true, suitest_control_unit_online: true }))).toBe(true);
  });
});
