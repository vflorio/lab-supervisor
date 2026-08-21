import { describe, expect, it } from "vitest";
import * as Facet from "./Facet";

describe("Facet", () => {
  it("una camera ha due facce indipendenti, CU e TV una sola (FATTO-6/7/8)", () => {
    expect(Facet.facetsOf("AndroidCamera")).toEqual(["AdbTransport", "StreamAvailable"]);
    expect(Facet.facetsOf("ControlUnit")).toEqual(["Reachable"]);
    expect(Facet.facetsOf("Tv")).toEqual(["Reachable"]);
  });
});
