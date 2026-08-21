// FL-3 · I figli di una CU che cadono insieme, e i non-flussi che ci stanno intorno.
// Scenari S10–S14, S19.

import { describe, expect, it } from "vitest";
import * as RecoveryTarget from "../../src/domain/RecoveryTarget";
import { makeLab, t } from "../fixtures/lab";
import { labProfiles, tvProfileForTests } from "../fixtures/labProfiles";

// La CU risponde; sono le TV a cadere, una dopo l'altra.
const tvsFalling = (lab: ReturnType<typeof makeLab>, when: ReadonlyArray<number>) => {
  lab.face(lab.cu.id, "Reachable", "up", 0);
  when.forEach((since, index) => lab.face(lab.tvs[index]!.id, "Reachable", "down", since));
};

const targets = (lab: ReturnType<typeof makeLab>) =>
  lab.sessions().map((session) => RecoveryTarget.key(session.target));

describe("S10 · le quattro TV di una CU cadono", () => {
  it("una sola sessione sul cluster, zero sessioni sulle TV, e l'outage data al quorum", async () => {
    const lab = makeLab();
    tvsFalling(lab, [0, 10, 20, 30]);
    await lab.detect("Reachable");

    expect(targets(lab)).toEqual(["cluster:cu-1"]);
    const [session] = lab.sessions();
    // Non al primo caduto: al più tardo fra quelli che servivano a formare il quorum.
    expect(session?.outageSince).toEqual(t(30));
    expect(RecoveryTarget.actsOn(session!.target)).toBe(lab.cu.id);

    // Il grace del cluster è 1 minuto dal quorum.
    await lab.until(89);
    expect(lab.dispatched()).toEqual([]);
    await lab.until(90);
    expect(lab.dispatched()).toEqual([{ deviceId: lab.cu.id, remedy: { _tag: "RebootHardware" } }]);
  });
});

describe("S11 · a TV already had a session when the quorum forms", () => {
  it("quella sessione viene assorbita con Superseded e ne resta una sola attiva (INV-1)", async () => {
    const lab = makeLab({ profiles: [...labProfiles, tvProfileForTests] });
    lab.face(lab.cu.id, "Reachable", "up", 0);
    for (const index of [0, 1, 2]) lab.face(lab.tvs[index]!.id, "Reachable", "down", 0);

    // Tre TV giù su quattro: `AllChildren` non incolpa ancora la CU, quindi sono tre guasti singoli.
    await lab.detect("Reachable");
    expect(targets(lab)).toEqual(["device:tv-1", "device:tv-2", "device:tv-3"]);

    lab.face(lab.tvs[3]!.id, "Reachable", "down", 40);
    lab.at(40);
    await lab.detect("Reachable");

    const active = lab.sessions().filter((session) => session.phase._tag !== "Aborted");
    expect(active.map((session) => RecoveryTarget.key(session.target))).toEqual(["cluster:cu-1"]);
    const absorbed = lab.sessions().filter((session) => session.phase._tag === "Aborted");
    expect(absorbed).toHaveLength(3);
    for (const session of absorbed)
      expect(session.phase).toMatchObject({ reason: { _tag: "Superseded", bySessionId: active[0]?.id } });
  });
});

describe("S12 · la CU torna ma le TV no (INV-8)", () => {
  it("is not a recovery: the session exhausts and raises an incident", async () => {
    const lab = makeLab();
    tvsFalling(lab, [0, 0, 0, 0]);
    await lab.detect("Reachable");

    await lab.until(60); // quorum a 0 ⇒ grace fino a 60 ⇒ reboot
    expect(lab.dispatched()).toHaveLength(1);

    // La CU risponde di nuovo, ma il cluster non è guarito: le TV sono ancora giù.
    lab.face(lab.cu.id, "Reachable", "up", 70);
    await lab.until(105);
    expect(lab.sessions()[0]?.phase._tag).toBe("Verifying");

    await lab.until(241); // verifica scaduta ⇒ secondo tentativo dopo il backoff
    await lab.until(301);
    await lab.until(482);

    expect(lab.sessions()[0]?.phase).toMatchObject({ _tag: "GivenUp" });
    expect(lab.incidents()).toHaveLength(1);
    // Il dossier fotografa tutte le facce di tutti i device coinvolti: la CU e le sue quattro TV.
    expect(lab.incidents()[0]?.facets).toHaveLength(5);
  });

  it("if the TVs come back too, then yes", async () => {
    const lab = makeLab();
    tvsFalling(lab, [0, 0, 0, 0]);
    await lab.detect("Reachable");
    await lab.until(60);

    lab.face(lab.cu.id, "Reachable", "up", 70);
    for (const tv of lab.tvs) lab.face(tv.id, "Reachable", "up", 80);
    await lab.until(105);

    expect(lab.sessions()[0]?.phase._tag).toBe("Resolved");
    expect(lab.incidents()).toEqual([]);
  });
});

describe("S13 · three cameras down, suspended via Observes to a TV of the same CU (NF-2)", () => {
  it("tre bersagli Device, e mai un reboot della CU", async () => {
    const lab = makeLab();
    lab.face(lab.cu.id, "Reachable", "up", 0);
    for (const camera of lab.cameras) {
      lab.face(camera.id, "StreamAvailable", "down", 0);
      lab.face(camera.id, "AdbTransport", "up", 0);
    }
    await lab.detect("StreamAvailable");

    expect(targets(lab)).toEqual(["device:cam-1", "device:cam-2", "device:cam-3"]);

    await lab.until(180);
    expect(
      lab
        .dispatched()
        .map((call) => call.deviceId)
        .sort(),
    ).toEqual(["cam-1", "cam-2", "cam-3"]);
    expect(lab.dispatched().map((call) => call.deviceId)).not.toContain(lab.cu.id);
  });
});

describe("S14 · a TV is under maintenance hold (INV-11)", () => {
  it("esce dal conto, e le altre tre bastano a formare il quorum", async () => {
    const lab = makeLab();
    lab.face(lab.cu.id, "Reachable", "up", 0);
    await lab.hold(lab.tvs[3]!.id, "sostituzione pannello");
    for (const index of [0, 1, 2]) lab.face(lab.tvs[index]!.id, "Reachable", "down", 0);

    await lab.detect("Reachable");

    expect(targets(lab)).toEqual(["cluster:cu-1"]);
    const [session] = lab.sessions();
    expect([...RecoveryTarget.members(session!.target)].sort()).toEqual(["cu-1", "tv-1", "tv-2", "tv-3"]);
  });
});

describe("S19 · a TV down alone (NF-1)", () => {
  it("nessuna sessione: il kind Tv non ha profilo", async () => {
    const lab = makeLab();
    lab.face(lab.cu.id, "Reachable", "up", 0);
    lab.face(lab.tvs[0]!.id, "Reachable", "down", 0);

    const outcomes = await lab.detect("Reachable");
    expect(outcomes.map((result) => result.outcome._tag)).toEqual(["NoProfile"]);
    expect(lab.sessions()).toEqual([]);
  });

  it("ma partecipa lo stesso alla correlazione", async () => {
    const lab = makeLab();
    tvsFalling(lab, [0, 0, 0, 0]);
    await lab.detect("Reachable");
    expect(targets(lab)).toEqual(["cluster:cu-1"]);
  });
});
