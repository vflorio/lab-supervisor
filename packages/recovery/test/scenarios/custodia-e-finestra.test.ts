// Chi ha il diritto di comandare, e quando. Scenari S15–S18.

import { describe, expect, it } from "vitest";
import { makeLab } from "../fixtures/lab";

const cameraDown = () => {
  const lab = makeLab();
  const camera = lab.cameras[0]!;
  lab.face(camera.id, "StreamAvailable", "down", 0);
  lab.face(camera.id, "AdbTransport", "up", 0);
  return { lab, camera };
};

describe("S15 · il device torna sano durante il grace (INV-7)", () => {
  it("la sessione si chiude da sola e nessun comando parte", async () => {
    const { lab, camera } = cameraDown();
    await lab.detect("StreamAvailable");

    lab.face(camera.id, "StreamAvailable", "up", 100);

    // Il controllo sta nel punto — e solo nel punto — in cui sta per partire un comando: al tick in
    // cui il grace scade. Non serve una policy che insegua gli eventi di guarigione.
    await lab.until(180);

    expect(lab.sessions()[0]?.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "SelfHealed" } });
    expect(lab.dispatched()).toEqual([]);
    expect(lab.incidents()).toEqual([]);
  });
});

describe("S16 · maintenance hold a metà recupero (FATTO-15)", () => {
  it("la sessione abortisce, nessun comando dopo, nessun incidente", async () => {
    const { lab, camera } = cameraDown();
    await lab.detect("StreamAvailable");
    await lab.until(180);
    expect(lab.dispatched()).toHaveLength(1);

    lab.at(200);
    await lab.hold(camera.id, "sostituzione cavo");
    await lab.until(240);

    expect(lab.sessions()[0]?.phase).toMatchObject({
      _tag: "Aborted",
      reason: { _tag: "MaintenanceHold", by: "sostituzione cavo" },
    });
    // Un hold non è un guasto.
    expect(lab.incidents()).toEqual([]);

    await lab.until(600);
    expect(lab.dispatched()).toHaveLength(1);
  });

  it("e al ciclo successivo la sessione non viene riaperta", async () => {
    const { lab, camera } = cameraDown();
    await lab.detect("StreamAvailable");
    await lab.until(180);
    lab.at(200);
    await lab.hold(camera.id, "sostituzione cavo");
    await lab.until(240);

    const outcomes = await lab.detect("StreamAvailable");
    expect(outcomes.map((result) => result.outcome._tag)).toEqual(["NotSupervisable"]);
    expect(lab.sessions()).toHaveLength(1);
    expect(lab.dispatched()).toHaveLength(1);
  });
});

describe("S17 · il cooldown dopo una resa (INV-9)", () => {
  it("non si riapre nulla sugli stessi device finché non è passato, e poi sì", async () => {
    const lab = makeLab();
    lab.face(lab.cu.id, "Reachable", "down", 0);
    await lab.detect("Reachable");

    await lab.until(60);
    await lab.until(241);
    await lab.until(301);
    await lab.until(482); // resa: cooldown di 30 minuti da qui
    expect(lab.sessions()[0]?.phase._tag).toBe("GivenUp");

    lab.at(600);
    const blocked = await lab.detect("Reachable");
    expect(blocked.map((result) => result.outcome._tag)).toEqual(["Blocked"]);
    expect(lab.sessions()).toHaveLength(1);

    lab.at(2283); // 482 + 1800 + 1
    const reopened = await lab.detect("Reachable");
    expect(reopened.map((result) => result.outcome._tag)).toEqual(["Opened"]);
    expect(lab.sessions()).toHaveLength(2);
  });
});

describe("S18 · fuori dalla finestra (FATTO-14, INV-3)", () => {
  // La finestra del lab è Lun–Ven 09:00–18:00: il tempo zero degli scenari è un lunedì alle 10:00,
  // e 28 800 secondi dopo sono le 18:00.
  const evening = 28_900;

  it("nessun comando parte fuori orario", async () => {
    const { lab } = cameraDown();
    await lab.detect("StreamAvailable");

    lab.at(evening);
    await lab.tick();

    expect(lab.dispatched()).toEqual([]);
    expect(lab.sessions()[0]?.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "OutOfWindow" } });
  });

  it("una sessione già in corso si ferma quando la finestra si chiude", async () => {
    const { lab } = cameraDown();
    await lab.detect("StreamAvailable");
    await lab.until(180);
    expect(lab.sessions()[0]?.phase._tag).toBe("Verifying");

    lab.at(evening);
    await lab.tick();

    expect(lab.sessions()[0]?.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "OutOfWindow" } });
    expect(lab.dispatched()).toHaveLength(1);
    expect(lab.incidents()).toEqual([]);
  });
});
