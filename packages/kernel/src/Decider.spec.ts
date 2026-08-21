import { describe, expect, it } from "vitest";
import * as Decider from "./Decider";

describe("Decider", () => {
  it("una decisione senza eventi non ne inventa", () => {
    expect(Decider.unchanged(1).events).toEqual([]);
  });

  it("andThen accumula gli eventi in ordine e porta avanti lo stato", () => {
    const first = Decider.decision(1, ["a"]);
    const composed = Decider.andThen(first, (n) => Decider.decision(n + 1, ["b"]));
    expect(composed).toEqual({ state: 2, events: ["a", "b"] });
  });

  it("emit aggiunge in coda senza toccare lo stato", () => {
    expect(Decider.emit(Decider.decision(1, ["a"]), "b")).toEqual({ state: 1, events: ["a", "b"] });
  });
});
