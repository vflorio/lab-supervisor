// Il servizio montato intero, senza un lab a cui parlare: gli unici tre pezzi sostituiti sono
// quelli che toccano il mondo — l'orologio, `adb`, la rete. Tutto il resto è ciò che gira in
// laboratorio, dal file di configurazione fino al messaggio che parte per Slack.
// È il test che un composition root merita: non verifica il dominio (ha i suoi scenari, in
// `@lab/recovery`) ma il **montaggio** — che la sonda giusta legga la faccia giusta, che il rimedio
// esca dal canale giusto, che una camera giù non faccia riavviare la ControlUnit.

import { RecordingSlack } from "@lab/alerting/testing";
import { FakeAdb, FakeSuitest } from "@lab/hardware-control/testing";
import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as FakeClock from "@lab/kernel/testing/FakeClock";
import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as Config from "../src/config/Config";
import * as Logger from "../src/Logger";
import * as Supervisor from "../src/Supervisor";

// Mercoledì 14 gennaio 2026, 10:00 UTC. Le finestre dei test sono dichiarate in UTC: un fuso qui
// dentro verificherebbe `Intl`, che ha già i suoi test in `@lab/recovery`.
const START = Instant.fromEpochMillis(Date.UTC(2026, 0, 14, 10, 0, 0));

const CAMERA_ENDPOINT = "10.0.0.31:5555";

const openWindow = `{ "days": ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"], "from": "00:00", "to": "24:00", "zone": "UTC" }`;
const closedWindow = `{ "days": [], "from": "00:00", "to": "24:00", "zone": "UTC" }`;

const configText = (window: string) => `{
  "log": { "level": "error" },
  "monitoring": { "probeInterval": "20s", "snapshotTtl": "5s", "flapping": { "failureThreshold": 1, "successThreshold": 1 } },
  "recovery": { "tickInterval": "5s" },
  "suitest": { "baseUrl": "https://the.suite.st/api/public/v4", "tokenId": "id", "tokenPassword": "secret", "timeout": "5s" },
  "adb": {
    "binary": "adb", "commandTimeout": "10s", "bootTimeout": "60s",
    "captureApp": {
      "packageId": "com.suitest.android.camera",
      "activity": "com.suitest.android.camera.CameraActivity",
      "settleAfterLaunch": "0ms",
      "profileTaps": [],
      "connectTaps": []
    }
  },
  "slack": { "active": true, "baseUrl": "https://slack.com/api", "botToken": "token", "channel": "#lab", "timeout": "5s" },
  "devices": [
    { "id": "cu-1", "kind": "ControlUnit", "unitType": "candybox", "suitest": "control-unit-1", "capabilities": ["RebootHardware"] },
    { "id": "tv-1", "kind": "Tv", "suitest": "device-1", "attach": { "to": "cu-1", "relation": "DependsOn" } },
    { "id": "cam-1", "kind": "AndroidCamera", "adb": "${CAMERA_ENDPOINT}", "suitest": "vcd-1", "attach": { "to": "tv-1", "relation": "Observes" } }
  ],
  "profiles": [
    {
      "kind": "AndroidCamera",
      "trigger": "StreamAvailable",
      "grace": "1m",
      "criticality": "NotifyWhenExhausted",
      "cooldownAfterGiveUp": "30m",
      "window": ${window},
      "playbook": [{
        "remedy": "RestartApp",
        "app": "com.suitest.android.camera",
        "dispatchTimeout": "30s",
        "verify": { "facet": "StreamAvailable", "settle": "10s", "poll": "5s", "timeout": "60s" },
        "retry": { "maxAttempts": 1, "backoff": { "kind": "fixed", "delay": "30s" } }
      }]
    },
    {
      "kind": "ControlUnit",
      "trigger": "Reachable",
      "grace": "1m",
      "criticality": "NotifyWhenExhausted",
      "cooldownAfterGiveUp": "30m",
      "window": ${window},
      "correlation": { "rule": { "kind": "allChildren" }, "grace": "1m" },
      "playbook": [{
        "remedy": "RebootHardware",
        "dispatchTimeout": "30s",
        "verify": { "facet": "Reachable", "settle": "45s", "poll": "15s", "timeout": "3m" },
        "retry": { "maxAttempts": 1, "backoff": { "kind": "fixed", "delay": "1m" } }
      }]
    }
  ]
}`;

type Lab = { readonly cameraStream?: boolean; readonly controlUnit?: boolean; readonly tv?: boolean };

const mount = async (options: { window?: string; lab?: Lab } = {}) => {
  const config = Config.parse(configText(options.window ?? openWindow));
  if (E.isLeft(config)) throw new Error(Config.describe(config.left));

  const lab = options.lab ?? {};
  const clock = FakeClock.make(START);
  const adb = FakeAdb.make([{ endpoint: CAMERA_ENDPOINT, state: "device" }]);
  const suitest = FakeSuitest.make({
    devices: [FakeSuitest.device("device-1", { status: lab.tv === false ? "OFFLINE" : "READY" })],
    controlUnits: [FakeSuitest.controlUnit("control-unit-1", { online: lab.controlUnit !== false })],
    videoCaptureDevices: [
      FakeSuitest.videoCaptureDevice("vcd-1", {
        assignedDeviceId: "device-1",
        online: lab.cameraStream !== false,
        streamActive: lab.cameraStream !== false,
      }),
    ],
  });
  const slack = RecordingSlack.make();

  const created = await Supervisor.create(config.right, Logger.silent, {
    clock,
    spawn: adb.spawn,
    suitestTransport: suitest.transport,
    slackTransport: slack.transport,
  })();
  if (E.isLeft(created)) throw new Error(created.left.detail);

  return { service: created.right, clock, adb, suitest, slack };
};

const advance = (clock: FakeClock.FakeClock, seconds: number) => clock.advance(Duration.seconds(seconds));

const phases = (service: Supervisor.Supervisor) => service.stores.sessions.all().map((session) => session.phase._tag);

describe("the full service, assembled", () => {
  it("records the config's devices and the topology it describes", async () => {
    const { service } = await mount();

    expect(
      service.stores.devices
        .all()
        .map((device) => String(device.id))
        .sort(),
    ).toEqual(["cam-1", "cu-1", "tv-1"]);
    expect(
      service.stores.profiles
        .all()
        .map((profile) => profile.kind)
        .sort(),
    ).toEqual(["AndroidCamera", "ControlUnit"]);
  });

  it("opens nothing when the lab is healthy", async () => {
    const { service } = await mount();

    await service.observeOnce();
    await service.tickOnce();

    expect(service.stores.sessions.all()).toEqual([]);
  });
});

describe("FL-1 · camera without stream, from config to command", () => {
  it("observes, waits for grace, restarts the app via adb, and delivers the incident to Slack", async () => {
    const { service, clock, adb, suitest, slack } = await mount({ lab: { cameraStream: false } });

    // Un giro di sonde: `streamActive: false` diventa una faccia `Unhealthy` confermata, e la
    // correlazione apre la sessione sul solo device caduto.
    await service.observeOnce();
    expect(phases(service)).toEqual(["AwaitingGrace"]);

    // Dentro il grace non parte niente: una camera che sfarfalla trenta secondi non si prende un
    // riavvio dell'app.
    await service.tickOnce();
    expect(FakeAdb.trace(adb)).not.toContain("shell am force-stop");

    advance(clock, 60);
    await service.tickOnce();
    expect(FakeAdb.trace(adb)).toContain("shell am force-stop");
    expect(phases(service)).toEqual(["Verifying"]);

    // Lo stream non torna: verifica scaduta, tentativi esauriti, resa — e a rimedi esauriti si
    // notifica (FATTO-16).
    advance(clock, 120);
    await service.tickOnce();
    expect(phases(service)).toEqual(["GivenUp"]);
    expect(slack.posted()).toHaveLength(1);

    // E soprattutto: nessuno ha riavviato la ControlUnit perché una camera era giù. La camera
    // *inquadra* la TV, non ne dipende (FATTO-3, NF-2).
    expect(suitest.dispatched()).toEqual([]);
  });

  it("outside the window sends no commands, and stops immediately what was open", async () => {
    const { service, clock, adb } = await mount({ window: closedWindow, lab: { cameraStream: false } });

    await service.observeOnce();
    advance(clock, 60);
    await service.tickOnce();

    expect(phases(service)).toEqual(["Aborted"]);
    expect(FakeAdb.trace(adb)).not.toContain("shell am force-stop");
  });
});

describe("FL-2 · unreachable ControlUnit", () => {
  it("restarts the unit via Suitest, and the TV that depends on it receives nothing", async () => {
    const { service, clock, suitest, adb } = await mount({ lab: { controlUnit: false, tv: false } });

    await service.observeOnce();
    expect(phases(service)).toEqual(["AwaitingGrace"]);

    advance(clock, 60);
    await service.tickOnce();

    // L'unica scrittura hardware che la Public API espone, sull'unica unità che la dichiara.
    expect(suitest.dispatched()).toEqual([{ unitId: "control-unit-1" }]);
    // Alla TV non si comanda niente: non esiste un canale che lo faccia, e riavviare la camera che
    // la inquadra non ripara il ponte.
    expect(FakeAdb.trace(adb)).not.toContain("reboot");
  });
});
