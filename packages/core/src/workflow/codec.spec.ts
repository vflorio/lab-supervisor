import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as BooleanTree from "../boolean-tree/tree";

import { CommandCodec } from "./codec";
import * as Condition from "./condition";

// `await` e `when` sono gli unici comandi che annidano un altro codec (ConditionCodec): il
// round-trip verifica che la forma JSON di una condizione resti quella dei tripwire, e che una
// foglia `probe` conviva con le foglie "fatto" nella stessa algebra.

describe("Command codec: await", () => {
  const json = ["await", ["truthy", "suitest_camera_connected"], "60s"];

  it("decodes a fact condition and a duration", () => {
    expect(CommandCodec.decode(json)).toStrictEqual(
      E.right({ type: "await", condition: Condition.truthy("suitest_camera_connected"), timeout: "60s" }),
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
      ["and", ["truthy", "suitest_camera_connected"], ["not", ["truthy", "suitest_camera_recording"]]],
      "2m",
    ]);

    expect(result).toStrictEqual(
      E.right({
        type: "await",
        condition: BooleanTree.and([
          Condition.truthy("suitest_camera_connected"),
          BooleanTree.not(Condition.truthy("suitest_camera_recording")),
        ]),
        timeout: "2m",
      }),
    );
  });

  it("rejects a timeout that is not a duration", () => {
    expect(E.isLeft(CommandCodec.decode(["await", ["truthy", "x"], 60]))).toBe(true);
  });
});

describe("Command codec: when", () => {
  it("decodes a guard without an else branch", () => {
    expect(CommandCodec.decode(["when", ["probe", "keyguardShowing"], "unlock"])).toStrictEqual(
      E.right({ type: "when", condition: Condition.probe("keyguardShowing"), thenWorkflow: "unlock" }),
    );
  });

  it("decodes a guard with an else branch and round-trips it", () => {
    const json = ["when", ["not", ["truthy", "connected"]], "reconnect", "verify"];
    const decoded = CommandCodec.decode(json);
    if (E.isLeft(decoded)) throw new Error("expected a decoded command");

    expect(decoded.right).toStrictEqual({
      type: "when",
      condition: BooleanTree.not(Condition.truthy("connected")),
      thenWorkflow: "reconnect",
      elseWorkflow: "verify",
    });
    expect(CommandCodec.encode(decoded.right)).toStrictEqual(json);
  });

  it("requires the name of the workflow to run", () => {
    expect(E.isLeft(CommandCodec.decode(["when", ["truthy", "x"]]))).toBe(true);
  });
});

// Le primitive dietro restartApp/wakeUp: qui interessa solo che il tag esista e non collida
// con la macro omonima, così `when` può comporle al posto della macro.
describe("Command codec: primitives", () => {
  it.each([
    [["launchApp", "com.suitest.android.camera"], { type: "launchApp", packageId: "com.suitest.android.camera" }],
    [["forceStopApp", "com.suitest.android.camera"], { type: "forceStopApp", packageId: "com.suitest.android.camera" }],
    [["dismissKeyguard"], { type: "dismissKeyguard" }],
  ])("decodes %j and round-trips it", (json, expected) => {
    const decoded = CommandCodec.decode(json);
    expect(decoded).toStrictEqual(E.right(expected));
    if (E.isLeft(decoded)) throw new Error("expected a decoded command");

    expect(CommandCodec.encode(decoded.right)).toStrictEqual(json);
  });

  it.each([["launchApp"], ["forceStopApp"]])("rejects %s without a package id", (name) => {
    expect(E.isLeft(CommandCodec.decode([name]))).toBe(true);
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
