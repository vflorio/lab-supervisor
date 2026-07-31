import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import { CommandCodec } from "./codec";

// awaitPredicate è l'unico comando che annida un altro codec (PredicateExpressionCodec): il
// round-trip verifica che la forma JSON in config resti quella dei tripwire, non una variante.

describe("Command codec: awaitPredicate", () => {
  const json = ["awaitPredicate", ["ref", "suitest_camera_connected"], "60s"];

  it("decodes a nested predicate expression and a duration", () => {
    const result = CommandCodec.decode(json);

    expect(result).toStrictEqual(
      E.right({
        type: "awaitPredicate",
        expr: { type: "ref", name: "suitest_camera_connected" },
        timeout: "60s",
      }),
    );
  });

  it("round-trips back to the same JSON", () => {
    const decoded = CommandCodec.decode(json);
    if (E.isLeft(decoded)) throw new Error("expected a decoded command");

    expect(CommandCodec.encode(decoded.right)).toStrictEqual(json);
  });

  it("decodes composite expressions (and/or/not), like a tripwire predicate", () => {
    const result = CommandCodec.decode([
      "awaitPredicate",
      ["and", ["ref", "suitest_camera_connected"], ["not", ["ref", "suitest_camera_recording"]]],
      "2m",
    ]);

    expect(E.isRight(result)).toBe(true);
  });

  it("rejects a malformed predicate expression", () => {
    expect(E.isLeft(CommandCodec.decode(["awaitPredicate", ["unknownTag", "x"], "60s"]))).toBe(true);
  });

  it("rejects a timeout that is not a duration", () => {
    expect(E.isLeft(CommandCodec.decode(["awaitPredicate", ["ref", "x"], 60]))).toBe(true);
  });
});
