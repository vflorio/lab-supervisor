import * as Instant from "@lab/kernel/Instant";
import * as Remedy from "@lab/recovery/domain/Remedy";
import * as Capability from "@lab/registry/domain/Capability";
import * as Device from "@lab/registry/domain/Device";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as Endpoints from "@lab/registry/domain/Endpoints";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as AdbDeviceControl from "./AdbDeviceControl";
import type { DeviceLookup } from "./DeviceLookup";
import * as FakeAdb from "./testing/FakeAdb";

const t0 = Instant.fromEpochMillis(1_000_000);
const endpoint = "10.0.0.9:5555";
const app = "com.suitest.android.camera";

// I valori veri del lab, dal branch `main` (`apps/service/config/config.lab.jsonc`): il profilo
// `experimental-wide` si sceglie con quattro tap in pixel, il connect con bottone più conferma.
const config: AdbDeviceControl.AdbConfig = {
  binary: "adb",
  commandTimeoutMs: 15_000,
  bootTimeoutMs: 90_000,
  captureApp: {
    packageId: "com.suitest.android.camera",
    activity: "com.suitest.android.camera.CameraActivity",
    profileTaps: [
      AdbDeviceControl.pixels(2200, 160), // impostazioni (in alto a destra)
      AdbDeviceControl.pixels(1000, 440), // profilo
      AdbDeviceControl.pixels(1000, 640), // profilo: experimental
      AdbDeviceControl.pixels(180, 180), // indietro (in alto a sinistra)
    ],
    connectTaps: [
      AdbDeviceControl.fraction(0.9, 0.1), // bottone connect
      AdbDeviceControl.fraction(0.5, 0.5), // conferma
    ],
    settleAfterLaunchMs: 0,
  },
};

const camera = (
  options: { readonly adb?: string; readonly capabilities?: ReadonlySet<Capability.Capability> } = {},
) => {
  const decision = Device.register(
    {
      id: DeviceId.of("cam-1"),
      kind: "AndroidCamera",
      endpoints: Endpoints.make(options.adb ? { adb: O.some(Endpoints.adbEndpoint(options.adb)) } : {}),
      capabilities: options.capabilities ?? Capability.capabilitiesOfKind("AndroidCamera"),
    },
    t0,
  );
  if (E.isLeft(decision)) throw new Error("fixture non valida");
  return decision.right.state;
};

const lookupOf = (...devices: ReadonlyArray<Device.Device>): DeviceLookup => {
  const byId = new Map(devices.map((device) => [String(device.id), device]));
  return (id) => TE.right(O.fromNullable(byId.get(String(id))));
};

const run = async (port: ReturnType<typeof AdbDeviceControl.make>, id: DeviceId.DeviceId, remedy: Remedy.Remedy) => {
  const result = await port.apply(id, remedy)();
  if (E.isLeft(result)) throw new Error("la porta non ha canale d'errore");
  return result.right;
};

describe("AdbDeviceControl", () => {
  it("ReconnectTransport disconnette prima di riconnettere: un transport incastrato sopravvive a un connect nudo", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.reconnectTransport)).toEqual({ _tag: "Accepted" });
    expect(FakeAdb.verbs(adb)).toEqual(["disconnect", "connect"]);
  });

  it("un disconnect fallito non ferma la riconnessione: non c'era niente da disconnettere", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make();
    adb.failOn("disconnect", { _tag: "NonZeroExit", code: 1, stderr: "no such device" });
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.reconnectTransport)).toEqual({ _tag: "Accepted" });
    expect(FakeAdb.verbs(adb)).toEqual(["disconnect", "connect"]);
  });

  it("RestartApp is force-stop plus launch, and the app name comes from the domain", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.restartApp(Remedy.appRef(app)))).toEqual({
      _tag: "Accepted",
    });
    expect(adb.commands()).toEqual([
      ["-s", endpoint, "shell", "am", "force-stop", app],
      ["-s", endpoint, "shell", "monkey", "-p", app, "-c", "android.intent.category.LAUNCHER", "1"],
    ]);
  });

  it("RelaunchSuite sveglia, porta l'app in primo piano, sceglie il profilo e connette, in quest'ordine (FATTO-11)", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    adb.keyguard(true);
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.relaunchSuite)).toEqual({ _tag: "Accepted" });
    expect(FakeAdb.trace(adb)).toEqual([
      "shell input keyevent", // wakeUp
      "shell dumpsys window", // il lockscreen c'è davvero?
      "shell input swipe", // sì: si sblocca
      "shell dumpsys window", // l'app è in primo piano?
      "shell monkey -p", // no: si lancia
      "shell wm size", // serve a risolvere i tap in frazione
      "shell input tap", // profilo: impostazioni
      "shell input tap", // profilo: voce
      "shell input tap", // profilo: experimental
      "shell input tap", // profilo: indietro
      "shell input tap", // connect
      "shell input tap", // conferma
    ]);
  });

  it("does not unlock an already unlocked screen: that swipe would scroll the app instead of unlocking", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    adb.keyguard(false);
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    await run(control, device.id, Remedy.relaunchSuite);
    expect(FakeAdb.trace(adb)).not.toContain("shell input swipe");
  });

  it("does not restart an app already in foreground: restarting what works is the quickest way to break it", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    adb.foreground("com.suitest.android.camera/com.suitest.android.camera.CameraActivity");
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    await run(control, device.id, Remedy.relaunchSuite);
    expect(FakeAdb.trace(adb)).not.toContain("shell monkey -p");
  });

  it("i tap in pixel restano tali, quelli in frazione si risolvono sulla dimensione vera dello schermo", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    adb.screen(2400, 1080);
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    await run(control, device.id, Remedy.relaunchSuite);
    const taps = adb
      .commands()
      .filter((args) => args.includes("tap"))
      .map((args) => args.slice(-2).join(","));

    // I quattro del profilo sono pixel e passano invariati; i due del connect erano 0.9/0.1 e
    // 0.5/0.5, e senza risoluzione finirebbero a ridosso dell'angolo in alto a sinistra.
    expect(taps).toEqual(["2200,160", "1000,440", "1000,640", "180,180", "2160,108", "1200,540"]);
  });

  it("se la dimensione dello schermo non si legge, la sequenza si ferma invece di toccare a caso", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    adb.failOn("shell", undefined);
    const control = AdbDeviceControl.make(config, {
      lookup: lookupOf(device),
      spawn: (command, args, timeoutMs) =>
        args.includes("wm") && args.includes("size")
          ? TE.right("nessuna dimensione qui")
          : adb.spawn(command, args, timeoutMs),
    });

    const outcome = await run(control, device.id, Remedy.relaunchSuite);
    expect(outcome._tag).toBe("TransportError");
    // I quattro tap in pixel sono partiti; i due in frazione no.
    expect(adb.commands().filter((args) => args.includes("tap"))).toHaveLength(4);
  });

  it("a hanging command is a channel failure, not a refusal (FACT-12)", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make([{ endpoint, state: "device" }]);
    adb.failOn("reboot", { _tag: "Timeout", afterMs: 15_000 });
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.rebootHardware)).toEqual({
      _tag: "TransportError",
      detail: "adb appeso oltre 15000ms",
    });
  });

  it("`device not found` is unreachable, not a transport error", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make();
    adb.failOn("reboot", { _tag: "NonZeroExit", code: 1, stderr: "error: device '10.0.0.9:5555' not found" });
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.rebootHardware)).toEqual({ _tag: "Unreachable" });
  });

  it("PowerOn on a camera is Unsupported: it is a phone, and a person powers it on", async () => {
    const device = camera({ adb: endpoint });
    const adb = FakeAdb.make();
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.powerOn)).toEqual({ _tag: "Unsupported" });
    expect(adb.commands()).toEqual([]);
  });

  it("a camera without adb endpoint is a written outcome, not an exception (FACT-9)", async () => {
    const device = camera();
    const adb = FakeAdb.make();
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.reconnectTransport)).toEqual({
      _tag: "Rejected",
      reason: "nessun endpoint adb per questo device",
    });
    expect(adb.commands()).toEqual([]);
  });

  it("una camera che non dichiara AdbTcp non si riconnette (FATTO-1)", async () => {
    const device = camera({ adb: endpoint, capabilities: Capability.setOf("AppControl") });
    const adb = FakeAdb.make();
    const control = AdbDeviceControl.make(config, { lookup: lookupOf(device), spawn: adb.spawn });

    expect(await run(control, device.id, Remedy.reconnectTransport)).toEqual({ _tag: "Unsupported" });
    expect(adb.commands()).toEqual([]);
  });
});
