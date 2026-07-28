import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as A from "fp-ts/Array";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";
import * as Network from "../../network";
import * as Shell from "../../shell";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface AdbEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
}

export interface AdbError extends Errors.AppError<"AdbError"> {}

export type Error = Shell.ShellSpawnError | AdbError;

type Effect<A> = RTE.ReaderTaskEither<AdbEnv, Error, A>;

export interface Device {
  readonly target: Network.Endpoint;
  readonly status: Status;
}

export type Status =
  | "device"
  | "recovery"
  | "rescue"
  | "sideload"
  | "bootloader"
  | "disconnect"
  | "offline"
  | "unknown";

export const matchDeviceState = (raw: string): O.Option<Status> =>
  match(raw)
    .with(
      P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
      (s): O.Option<Status> => O.some(s),
    )
    .otherwise(() => O.none);

// -------------------------------------------------------------------------------------
// Shell runner
// -------------------------------------------------------------------------------------

// Limite di default per ogni comando ADB "one-shot": senza, un transport incastrato (adb
// devices lo riporta ancora come "device" ma non risponde più) blocca per sempre il comando e
// tutto ciò che lo aspetta (vedi TODO "Disconnect+reconnect esplicito su comando fallito").
// Esplicitamente escluso per `waitForState` sotto: quei comandi sono bloccanti-per-design
// (aspettano un cambio di stato reale, non un timeout applicativo).
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;

const run =
  (
    args: readonly string[],
    target?: Network.Endpoint,
    timeoutMs: number | undefined = DEFAULT_COMMAND_TIMEOUT_MS,
  ): Effect<string> =>
  ({ logger, spawn: shell }) =>
    Shell.run("adb", target ? ["-s", Network.format(target), ...args] : [...args], timeoutMs)({ spawn: shell, logger });

// -------------------------------------------------------------------------------------
// Parser - `adb devices` output
// -------------------------------------------------------------------------------------
// Output format:
//   List of devices attached
//   192.168.1.4:5555\tdevice -> catturato
//   emulator-5554\toffline   -> escluso

const parseDevicesLine = (line: string): O.Option<Device> => {
  const parts = line.trim().split("\t");
  if (parts.length < 2) return O.none;

  return pipe(
    O.Do,
    O.bind("target", () =>
      pipe(
        Network.Codec.decode(parts[0]),
        E.fold(() => O.none, O.some),
      ),
    ),
    O.bind("status", () => matchDeviceState(parts[1] ?? "")),
  );
};

const parseDevices = (stdout: string): Device[] =>
  pipe(
    stdout.split("\n"),
    A.filter((line) => line.trim() !== "" && !line.startsWith("List of")),
    A.filterMap(parseDevicesLine),
  );

// -------------------------------------------------------------------------------------
// Public API - Connection & device state
// -------------------------------------------------------------------------------------

export const getState = (target: Network.Endpoint): Effect<Status> =>
  pipe(
    run(["get-state"], target),
    RTE.map((stdout) => stdout.trim()),
    RTE.map((state) =>
      match(state)
        .with(
          P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
          (s) => s as Status,
        )
        .otherwise(() => "unknown" as Status),
    ),
  );

// Pair
export const pair =
  (pairingCode: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run(["pair", Network.format(target), pairingCode]), RTE.asUnit);

// Connect
export const connect = (target: Network.Endpoint): Effect<void> =>
  pipe(run(["connect", Network.format(target)]), RTE.asUnit);

// Disconnect
export const disconnect = (target: Network.Endpoint): Effect<void> =>
  pipe(run(["disconnect", Network.format(target)]), RTE.asUnit);

// Variante best-effort di `disconnect`: un fallimento non è mai bloccante - si sta ripulendo una
// entry di transport che potrebbe benissimo non esistere più, e l'obiettivo (nessun transport
// stale verso quel target) è raggiunto comunque. Si logga soltanto.
// Usata sia per gli host stray sia per l'intent Disconnect della macchina android-bridge.
export const disconnectQuietly =
  (target: Network.Endpoint): RTE.ReaderTaskEither<AdbEnv, never, void> =>
  (env) =>
    pipe(
      disconnect(target)(env),
      TE.orElseFirstIOK((error) =>
        env.logger.error(`Disconnect failed for ${Network.format(target)}: ${Errors.format(error)}`),
      ),
      TE.orElse((): TE.TaskEither<never, void> => TE.right(undefined)),
    );

// TCP-IP protocol set
export const tcpip =
  (port: number) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run(["tcpip", String(port)], target), RTE.asUnit);

// List connected devices with their status
export const devices: Effect<Device[]> = pipe(run(["devices"]), RTE.map(parseDevices));

// Wait for a device to reach a specific state (e.g., "device" or "disconnect") - nessun timeout:
// bloccante per design, a differenza di tutti gli altri comandi sopra (vedi DEFAULT_COMMAND_TIMEOUT_MS)
export const waitForState =
  (state: Status) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run([`wait-for-${state}`], target, undefined), RTE.asUnit);

export const waitForDevice = waitForState("device");
export const waitForDisconnect = waitForState("disconnect");

// -------------------------------------------------------------------------------------
// Public API - Power control
// -------------------------------------------------------------------------------------

// Reboot the device
export const reboot = (target: Network.Endpoint): Effect<void> => pipe(run(["reboot"], target), RTE.asUnit);

// -------------------------------------------------------------------------------------
// Public API - Input & UI interaction
// -------------------------------------------------------------------------------------

// Wake the screen up (KEYCODE_WAKEUP = 224, does not toggle off if already on)
export const wakeUp = (target: Network.Endpoint): Effect<void> =>
  pipe(run(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], target), RTE.asUnit);

// Dismiss keyguard (swipe up gesture for non-secure lockscreen)
export const dismissKeyguard = (target: Network.Endpoint): Effect<void> =>
  pipe(run(["shell", "input", "swipe", "540", "1800", "540", "400", "300"], target), RTE.asUnit);

// Tap at screen coordinates (x, y)
export const inputTap =
  (x: number, y: number) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run(["shell", "input", "tap", String(x), String(y)], target), RTE.asUnit);

// -------------------------------------------------------------------------------------
// Public API - App lifecycle
// -------------------------------------------------------------------------------------

// Launch an app by package id
export const launchApp =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target), RTE.asUnit);

// Force-stop an app by package id
export const forceStopApp =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run(["shell", "am", "force-stop", packageId], target), RTE.asUnit);

// Force-stop and then start an app by package id
export const restartApp =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(
      forceStopApp(packageId)(target),
      RTE.flatMap(() => launchApp(packageId)(target)),
      RTE.asUnit,
    );

// Open a URL in the default browser via ACTION_VIEW intent
export const openUrl =
  (url: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(run(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url], target), RTE.asUnit);

// Open the "Developement Settings" screen (Settings > System > Development)
export const openDeveloperSettings = (target: Network.Endpoint): Effect<void> =>
  pipe(run(["shell", "am", "start", "-a", "android.settings.APPLICATION_DEVELOPMENT_SETTINGS"], target), RTE.asUnit);

// -------------------------------------------------------------------------------------
// Public API - Activity / window introspection
// -------------------------------------------------------------------------------------

// Get the currently focused (foreground) app activity
// Uses `dumpsys window` and reads `mFocusedApp` which reports the actual foreground activity
// even when system UI (NotificationShade, etc.) has window focus.
// Format: "mFocusedApp=ActivityRecord{hash u0 com.pkg/com.pkg.Activity} ..."
export const getResumedActivity = (target: Network.Endpoint): Effect<O.Option<string>> =>
  pipe(
    run(["shell", "dumpsys", "window"], target),
    RTE.map((stdout) => {
      // Join all lines to handle line wrapping in dumpsys output
      const flat = stdout.replace(/\n\s*/g, " ");
      const m = flat.match(/mFocusedApp=ActivityRecord\{[^}]*\s([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)/);
      return m ? O.some(m[1]!) : O.none;
    }),
  );

// Check if a specific activity (full component or substring) is currently in foreground
export const isActivityResumed =
  (activity: string) =>
  (target: Network.Endpoint): Effect<boolean> =>
    pipe(getResumedActivity(target), RTE.map(O.exists((resumed) => resumed.includes(activity))));
