// FL-2 · La ControlUnit irraggiungibile. Scenari S7–S9.

import * as Capability from "@lab/registry/domain/Capability";
import { describe, expect, it } from "vitest";
import { makeLab } from "../fixtures/lab";

const unitDown = (options: Parameters<typeof makeLab>[0] = {}) => {
  const lab = makeLab(options);
  lab.face(lab.cu.id, "Reachable", "down", 0);
  return lab;
};

describe("S7 · la CU torna dopo il reboot", () => {
  it("si risolve", async () => {
    const lab = unitDown();
    await lab.detect("Reachable");

    await lab.until(59);
    expect(lab.dispatched()).toEqual([]); // il grace della CU è di 1 minuto

    await lab.until(60);
    expect(lab.dispatched().map((call) => call.remedy._tag)).toEqual(["RebootHardware"]);
    expect(lab.dispatched()[0]?.deviceId).toBe(lab.cu.id);

    lab.face(lab.cu.id, "Reachable", "up", 70);
    await lab.until(105); // assestamento di 45s

    expect(lab.sessions()[0]?.phase._tag).toBe("Resolved");
    expect(lab.incidents()).toEqual([]);
  });
});

describe("S8 · la CU non torna mai", () => {
  it("due reboot accettati, poi un solo incidente", async () => {
    const lab = unitDown();
    await lab.detect("Reachable");

    await lab.until(60); // reboot, primo tentativo
    await lab.until(241); // verifica scaduta ⇒ backoff di 1 minuto
    await lab.until(301); // reboot, secondo tentativo
    await lab.until(482); // scaduta anche questa ⇒ resa

    expect(lab.dispatched()).toHaveLength(2);
    expect(lab.sessions()[0]?.phase).toMatchObject({
      _tag: "GivenUp",
      reason: { _tag: "PlaybookExhausted" },
    });
    expect(lab.incidents()).toHaveLength(1);
  });

  it("`PowerOn` non entra mai nel playbook della CU (FATTO-5, NF-3)", async () => {
    const lab = unitDown();
    await lab.detect("Reachable");
    await lab.until(60);
    await lab.until(241);
    await lab.until(301);
    await lab.until(482);
    expect(lab.dispatched().map((call) => call.remedy._tag)).not.toContain("PowerOn");
  });
});

describe("S9 · una CU che non dichiara RebootHardware (FATTO-1)", () => {
  it("l'esito è Unsupported e la resa è immediata, senza ritentativi", async () => {
    const lab = unitDown({ controlUnitCapabilities: Capability.setOf("PowerOn") });
    await lab.detect("Reachable");
    await lab.until(60);

    expect(lab.dispatched()).toHaveLength(1);
    expect(lab.sessions()[0]?.phase).toMatchObject({
      _tag: "GivenUp",
      reason: { _tag: "RemedyUnsupported" },
    });
    expect(lab.incidents()).toHaveLength(1);

    // Nemmeno più tardi: ritentare una cosa che quel device non saprà mai fare è solo rumore.
    await lab.until(600);
    expect(lab.dispatched()).toHaveLength(1);
  });
});
