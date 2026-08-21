import { readFileSync } from "node:fs";
import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as Config from "./Config";

const labConfig = readFileSync(new URL("../../config/config.lab.jsonc", import.meta.url), "utf-8");

// Il file di configurazione del lab non è un esempio: è ciò con cui il servizio parte davvero. Se
// smette di decodificare, il servizio non parte, e va scoperto qui e non in laboratorio.
describe("the lab config file", () => {
  it("parses with FL-1 and FL-2 profiles", () => {
    const config = Config.parse(labConfig);
    if (E.isLeft(config)) throw new Error(Config.describe(config.left));

    expect(config.right.profiles.map((profile) => profile.kind)).toEqual(["AndroidCamera", "ControlUnit"]);
    // La TV non ha profilo: monitorata e partecipa alla correlazione, ma non ha un recupero suo.
    expect(config.right.profiles.some((profile) => profile.kind === "Tv")).toBe(false);
    expect(config.right.devices).toHaveLength(8);
  });

  it("reads taps with their units, without mixing them", () => {
    const config = Config.parse(labConfig);
    if (E.isLeft(config)) throw new Error(Config.describe(config.left));

    const { profileTaps, connectTaps } = config.right.adb.captureApp;
    expect(profileTaps.map((tap) => tap._tag)).toEqual(["Pixels", "Pixels", "Pixels", "Pixels"]);
    // Il connect è in frazioni, ed è dichiarato tale: è la correzione del difetto per cui
    // `input tap 0.9 0.1` finiva nell'angolo in alto a sinistra invece che sul bottone.
    expect(connectTaps.map((tap) => tap._tag)).toEqual(["Fraction", "Fraction"]);
  });
});

const withProfiles = (profiles: string) => `{
  "log": { "level": "info" },
  "monitoring": { "probeInterval": "20s", "snapshotTtl": "10s", "flapping": { "failureThreshold": 3, "successThreshold": 2 } },
  "recovery": { "tickInterval": "5s" },
  "suitest": { "baseUrl": "http://x", "tokenId": "a", "tokenPassword": "b", "timeout": "10s" },
  "adb": {
    "binary": "adb", "commandTimeout": "30s", "bootTimeout": "90s",
    "captureApp": { "packageId": "p", "activity": "a", "settleAfterLaunch": "5s", "profileTaps": [], "connectTaps": [] }
  },
  "slack": { "active": false, "baseUrl": "http://x", "botToken": "t", "channel": "#c", "timeout": "10s" },
  "devices": [],
  "profiles": ${profiles}
}`;

const cameraProfile = (playbook: string) => `[{
  "kind": "AndroidCamera",
  "trigger": "StreamAvailable",
  "grace": "3m",
  "criticality": "NotifyWhenExhausted",
  "cooldownAfterGiveUp": "30m",
  "window": { "days": ["monday"], "from": "09:00", "to": "18:00", "zone": "Europe/Rome" },
  "playbook": ${playbook}
}]`;

const step = (remedy: string, verifies: string) => `{
  "remedy": "${remedy}",
  "dispatchTimeout": "30s",
  "verify": { "facet": "${verifies}", "settle": "5s", "poll": "5s", "timeout": "30s" },
  "retry": { "maxAttempts": 1, "backoff": { "kind": "fixed", "delay": "30s" } }
}`;

describe("what the service refuses to read", () => {
  it("rejects a playbook whose last step verifies a different facet from the trigger", () => {
    const config = Config.parse(withProfiles(cameraProfile(`[${step("RebootHardware", "AdbTransport")}]`)));

    expect(E.isLeft(config)).toBe(true);
    if (E.isLeft(config)) expect(Config.describe(config.left)).toContain("LastStepMustVerifyTrigger");
  });

  it("rejects a remedy that this device kind can never execute", () => {
    // `ReconnectTransport` chiede `AdbTcp`, e una TV non ce l'ha né potrà averla.
    const tv = `[{
      "kind": "Tv",
      "trigger": "Reachable",
      "grace": "1m",
      "criticality": "NotifyWhenExhausted",
      "cooldownAfterGiveUp": "30m",
      "window": { "days": ["monday"], "from": "09:00", "to": "18:00", "zone": "Europe/Rome" },
      "playbook": [${step("ReconnectTransport", "Reachable")}]
    }]`;
    const config = Config.parse(withProfiles(tv));

    expect(E.isLeft(config)).toBe(true);
    if (E.isLeft(config)) expect(Config.describe(config.left)).toContain("InvalidPlaybookForKind");
  });

  it("rejects a Suitest mirror that survives a probe cycle", () => {
    const config = Config.parse(
      withProfiles(cameraProfile(`[${step("RebootHardware", "StreamAvailable")}]`)).replace(
        '"snapshotTtl": "10s"',
        '"snapshotTtl": "20s"',
      ),
    );

    expect(E.isLeft(config)).toBe(true);
    if (E.isLeft(config)) expect(Config.describe(config.left)).toContain("snapshotTtl");
  });

  it("rejects a duration written as a bare number, saying where", () => {
    const config = Config.parse(
      withProfiles(cameraProfile(`[${step("RebootHardware", "StreamAvailable")}]`)).replace(
        '"probeInterval": "20s"',
        '"probeInterval": 20',
      ),
    );

    expect(E.isLeft(config)).toBe(true);
    if (E.isLeft(config)) expect(Config.describe(config.left)).toContain("monitoring.probeInterval");
  });
});

describe("JSONC", () => {
  it("keeps comments out and strings intact", () => {
    const parsed = Config.parse(
      withProfiles(cameraProfile(`[${step("RebootHardware", "StreamAvailable")}]`)).replace(
        '"baseUrl": "http://x", "tokenId"',
        '"baseUrl": "https://the.suite.st/api/public/v4", // this is not a comment, the one above is\n  "tokenId"',
      ),
    );

    expect(E.isRight(parsed)).toBe(true);
    if (E.isRight(parsed)) expect(parsed.right.suitest.baseUrl).toBe("https://the.suite.st/api/public/v4");
  });
});
