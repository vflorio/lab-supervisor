// FL-1 · La camera Android che non manda più lo stream. Scenari S1–S6.

import * as Duration from "@lab/kernel/Duration";
import { describe, expect, it } from "vitest";
import * as RemedyOutcome from "../../src/domain/RemedyOutcome";
import { makeLab, t } from "../fixtures/lab";

const remedies = (lab: ReturnType<typeof makeLab>) => lab.dispatched().map((call) => call.remedy._tag);

// Camera con lo stream giù dall'istante zero, e il transport adb giù con lui.
const cameraDown = (options: { transport?: "up" | "down" } = {}) => {
  const lab = makeLab();
  const camera = lab.cameras[0]!;
  lab.face(camera.id, "StreamAvailable", "down", 0);
  lab.face(camera.id, "AdbTransport", options.transport ?? "down", 0);
  return { lab, camera };
};

describe("S1 · lo stream non torna mai", () => {
  it("percorre la scala gradino per gradino e alza un solo incidente col dossier completo", async () => {
    const { lab, camera } = cameraDown();
    await lab.detect("StreamAvailable");

    // Il grace è di 3 minuti: prima non parte nulla.
    await lab.until(179);
    expect(lab.dispatched()).toEqual([]);

    await lab.until(180); // gradino 1: ReconnectTransport
    await lab.until(211); // scaduta la verifica ⇒ gradino 2, primo tentativo
    await lab.until(272); // fallito ⇒ backoff
    await lab.until(302); // gradino 2, secondo tentativo
    await lab.until(363); // esauriti ⇒ gradino 3: RebootHardware

    // Il device è tornato su, ma l'app di cattura no: è il caso che il gradino 4 esiste per curare.
    lab.face(camera.id, "AdbTransport", "up", 400);
    await lab.until(544); // gradino 3 scaduto ⇒ gradino 4: RelaunchSuite
    await lab.until(605); // scaduto anche quello ⇒ resa

    expect(remedies(lab)).toEqual([
      "ReconnectTransport",
      "RestartApp",
      "RestartApp",
      "RebootHardware",
      "RelaunchSuite",
    ]);

    const [session] = lab.sessions();
    expect(session?.phase).toMatchObject({ _tag: "GivenUp", reason: { _tag: "PlaybookExhausted" } });

    expect(lab.incidents()).toHaveLength(1);
    const incident = lab.incidents()[0]!;
    expect(incident.history).toHaveLength(5);
    expect(incident.history.every((record) => record.verdict._tag === "Some")).toBe(true);
    // La fotografia porta **tutte** le facce del device coinvolto, non solo quella d'innesco.
    expect(incident.facets.map((facet) => facet.ref.facet).sort()).toEqual(["AdbTransport", "StreamAvailable"]);
    expect(incident.outageSince).toEqual(t(0));
  });
});

describe("S2 · lo stream torna dopo il RestartApp", () => {
  it("si risolve, senza incidente e senza comandi di troppo", async () => {
    const { lab, camera } = cameraDown({ transport: "up" });
    await lab.detect("StreamAvailable");

    await lab.until(180); // gradino 1 scartato (il transport è sano) ⇒ gradino 2 dispacciato
    expect(remedies(lab)).toEqual(["RestartApp"]);

    lab.face(camera.id, "StreamAvailable", "up", 185);
    await lab.until(191);

    const [session] = lab.sessions();
    expect(session?.phase._tag).toBe("Resolved");
    expect(lab.dispatched()).toHaveLength(1);
    expect(lab.incidents()).toEqual([]);
  });
});

describe("S3 · uno stato sano ereditato da prima del comando (FATTO-13)", () => {
  it("non è una guarigione: si risolve solo quando il `since` è posteriore al dispaccio", async () => {
    const { lab, camera } = cameraDown({ transport: "up" });
    await lab.detect("StreamAvailable");
    await lab.until(180);

    // Suitest riporta lo stream attivo, ma è una lettura stantia: risale a prima del comando.
    lab.face(camera.id, "StreamAvailable", "up", 100);
    await lab.until(195);
    expect(lab.sessions()[0]?.phase._tag).toBe("Verifying");

    lab.face(camera.id, "StreamAvailable", "up", 190);
    await lab.until(200); // la verifica riprogramma il poll ogni 5s
    expect(lab.sessions()[0]?.phase._tag).toBe("Resolved");
  });
});

describe("S4 · il transport torna ma lo stream no (INV-6)", () => {
  it("si sale di gradino senza consumare tentativi", async () => {
    const { lab, camera } = cameraDown();
    await lab.detect("StreamAvailable");

    await lab.until(180);
    expect(remedies(lab)).toEqual(["ReconnectTransport"]);

    // Il rimedio ha fatto il suo lavoro sulla faccia che gli compete.
    lab.face(camera.id, "AdbTransport", "up", 183);
    await lab.until(186);

    // Gradino 2 dispacciato al primo tentativo: la verifica passata non ne ha consumato nessuno.
    expect(remedies(lab)).toEqual(["ReconnectTransport", "RestartApp"]);
    expect(lab.sessions()[0]?.phase).toMatchObject({ step: 1, attempt: 1 });
    expect(lab.sessions()[0]?.phase._tag).not.toBe("Resolved");
  });
});

describe("S5 · il transport è già sano all'apertura", () => {
  it("il gradino 1 viene scartato, non fallito, e lo scarto resta nel dossier (INV-4)", async () => {
    const { lab } = cameraDown({ transport: "up" });
    await lab.detect("StreamAvailable");
    await lab.until(180);

    expect(remedies(lab)).toEqual(["RestartApp"]);
    const [session] = lab.sessions();
    expect(session?.history[0]).toMatchObject({ step: 0, verdict: { value: "Skipped" } });
    expect(session?.phase).toMatchObject({ step: 1, attempt: 1 });
  });
});

describe("S6 · l'adapter non risponde entro la scadenza (FATTO-12, INV-10)", () => {
  it("il tentativo è fallito, la sessione prosegue, e le altre sessioni dovute avanzano lo stesso", async () => {
    const lab = makeLab();
    const [first, second] = lab.cameras;
    for (const camera of [first!, second!]) {
      lab.face(camera.id, "StreamAvailable", "down", 0);
      lab.face(camera.id, "AdbTransport", "up", 0);
    }
    await lab.detect("StreamAvailable");

    // L'adapter ci mette più del `dispatchTimeout` del gradino (30s).
    lab.deviceControl.takes(Duration.seconds(45));
    await lab.until(180);

    const sessions = lab.sessions();
    expect(sessions).toHaveLength(2);
    // Entrambe hanno dispacciato e entrambe hanno trattato l'esito tardivo come un fallimento.
    expect(lab.dispatched()).toHaveLength(2);
    for (const session of sessions) expect(session.phase._tag).toBe("BackingOff");
    for (const session of sessions) expect(session.history.some((record) => record.verdict._tag === "Some")).toBe(true);
  });

  it("un rimedio rifiutato è un esito, non un errore: finisce nel dossier", async () => {
    const { lab } = cameraDown({ transport: "up" });
    lab.deviceControl.answer("RestartApp", RemedyOutcome.rejected("device occupato"));
    await lab.detect("StreamAvailable");
    await lab.until(180);

    const [session] = lab.sessions();
    expect(session?.history[1]?.outcome).toMatchObject({ value: { _tag: "Rejected", reason: "device occupato" } });
    expect(session?.phase._tag).toBe("BackingOff");
  });
});
