import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as BooleanTree from "../boolean-tree/tree";
import * as Predicates from "../predicates/expression";
import { CommandCodec } from "./codec";
import * as Condition from "./condition";

// `await` e `when` sono gli unici comandi che annidano un altro codec (ConditionCodec): il
// round-trip verifica che la forma JSON di una condizione resti quella dei tripwire, e che una
// foglia `probe` conviva con le foglie "fatto" nella stessa algebra.

describe("Command codec: await", () => {
  const json = ["await", ["ref", "suitest_camera_connected"], "60s"];

  it("decodes a fact condition and a duration", () => {
    expect(CommandCodec.decode(json)).toStrictEqual(
      E.right({ type: "await", condition: Predicates.ref("suitest_camera_connected"), timeout: "60s" }),
    );
  });

  it("round-trips back to the same JSON", () => {
    const decoded = CommandCodec.decode(json);
    if (E.isLeft(decoded)) throw new Error("expected a decoded command");

    expect(CommandCodec.encode(decoded.right)).toStrictEqual(json);
  });

  it("accepts a tripwire-shaped composite expression verbatim", () => {
    const result = CommandCodec.decode([
      "await",
      ["and", ["ref", "suitest_camera_connected"], ["not", ["ref", "suitest_camera_recording"]]],
      "2m",
    ]);

    expect(result).toStrictEqual(
      E.right({
        type: "await",
        condition: BooleanTree.and([
          Predicates.ref("suitest_camera_connected"),
          BooleanTree.not(Predicates.ref("suitest_camera_recording")),
        ]),
        timeout: "2m",
      }),
    );
  });

  it("rejects a timeout that is not a duration", () => {
    expect(E.isLeft(CommandCodec.decode(["await", ["ref", "x"], 60]))).toBe(true);
  });
});

describe("Command codec: when", () => {
  it("decodes a guard without an else branch", () => {
    expect(CommandCodec.decode(["when", ["probe", "keyguardShowing"], "unlock"])).toStrictEqual(
      E.right({ type: "when", condition: Condition.probe("keyguardShowing"), thenWorkflow: "unlock" }),
    );
  });

  it("decodes a guard with an else branch and round-trips it", () => {
    const json = ["when", ["not", ["ref", "connected"]], "reconnect", "verify"];
    const decoded = CommandCodec.decode(json);
    if (E.isLeft(decoded)) throw new Error("expected a decoded command");

    expect(decoded.right).toStrictEqual({
      type: "when",
      condition: BooleanTree.not(Predicates.ref("connected")),
      thenWorkflow: "reconnect",
      elseWorkflow: "verify",
    });
    expect(CommandCodec.encode(decoded.right)).toStrictEqual(json);
  });

  it("requires the name of the workflow to run", () => {
    expect(E.isLeft(CommandCodec.decode(["when", ["ref", "x"]]))).toBe(true);
  });
});

describe("Command codec: probe leaves", () => {
  it("decodes a probe with its arguments", () => {
    expect(CommandCodec.decode(["await", ["probe", "orientation", "landscape"], "10s"])).toStrictEqual(
      E.right({ type: "await", condition: Condition.probe("orientation", "landscape"), timeout: "10s" }),
    );
  });

  it("rejects an unknown probe", () => {
    expect(E.isLeft(CommandCodec.decode(["await", ["probe", "batteryLevel"], "10s"]))).toBe(true);
  });

  it("rejects a wrong argument count", () => {
    expect(E.isLeft(CommandCodec.decode(["await", ["probe", "screenOn", "extra"], "10s"]))).toBe(true);
    expect(E.isLeft(CommandCodec.decode(["await", ["probe", "activityResumed"], "10s"]))).toBe(true);
  });

  it("rejects an argument outside the allowed options", () => {
    expect(E.isLeft(CommandCodec.decode(["await", ["probe", "orientation", "sideways"], "10s"]))).toBe(true);
  });
});
