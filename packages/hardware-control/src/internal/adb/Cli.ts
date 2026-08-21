// I verbi adb che servono ai quattro rimedi di una camera, e nient'altro. Travaso di
// `legacy/core/src/adapters/adb/shell.ts`, potato: il provisioning, il pairing e la macchina di
// connessione non riguardano il recupero, e portarli qui vorrebbe dire portare un secondo dominio
// dentro un ACL.
// Ogni verbo ha il proprio timeout perché non hanno la stessa pazienza: `adb connect` è secondi,
// `wait-for-device` dopo un reboot è minuti (FATTO-12). Nessuno di essi è senza scadenza.
// Parla adb e nient'altro: non conosce `Remedy`, non conosce `Facet`, non conosce `DeviceId`.

import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as Shell from "./Shell";

export type Point = { readonly x: number; readonly y: number };

// Un tap si esprime in due modi, e tenerli distinti è una correzione, non uno stile: nella
// configurazione del branch `main` le due forme convivono nello stesso campo, e le frazioni
// finivano in `adb shell input tap 0.9 0.1` senza mai essere risolte — cioè un tocco nell'angolo in
// alto a sinistra invece che sul bottone. Qui una frazione è dichiarata tale e viene moltiplicata
// per la dimensione vera dello schermo, letta dal device.
export type Tap =
  | { readonly _tag: "Pixels"; readonly x: number; readonly y: number }
  | { readonly _tag: "Fraction"; readonly x: number; readonly y: number };

export const pixels = (x: number, y: number): Tap => ({ _tag: "Pixels", x, y });

export const fraction = (x: number, y: number): Tap => ({ _tag: "Fraction", x, y });

export type ScreenSize = { readonly width: number; readonly height: number };

export const resolveTap = (tap: Tap, screen: O.Option<ScreenSize>): Point =>
  tap._tag === "Pixels"
    ? { x: Math.round(tap.x), y: Math.round(tap.y) }
    : pipe(
        screen,
        O.match(
          // Senza la dimensione dello schermo una frazione non è risolvibile. Toccare comunque,
          // nel punto sbagliato, sarebbe peggio che non toccare: il chiamante lo tratta come un
          // fallimento della sequenza.
          () => ({ x: -1, y: -1 }),
          (size) => ({ x: Math.round(tap.x * size.width), y: Math.round(tap.y * size.height) }),
        ),
      );

// L'app di cattura e come la si rimette online. Sono fatti del lab, non del codice: vivono in
// configurazione perché cambiano con il modello di telefono e con la versione dell'app, e un
// adapter che se li cablasse dentro andrebbe ricompilato per un tap spostato di venti pixel.
export type CaptureApp = {
  readonly packageId: string;
  // L'attività da cui si riconosce che l'app è davvero in primo piano, non solo installata.
  readonly activity: string;
  // Il profilo `experimental-wide` non si passa come extra dell'intent: si sceglie toccando la UI
  // (impostazioni → profilo → experimental → indietro). Quattro tap, ed è così che funziona
  // davvero sull'hardware (FATTO-11).
  readonly profileTaps: ReadonlyArray<Tap>;
  // Il connect: bottone e conferma. L'app si connette da sola all'avvio nella maggior parte dei
  // casi, e questa sequenza è per gli altri.
  readonly connectTaps: ReadonlyArray<Tap>;
  // Quanto aspettare che l'app disegni prima di toccarla: senza, il tap arriva su una schermata che
  // non c'è ancora. Sta in configurazione anche perché una suite di test non deve aspettarlo davvero.
  readonly settleAfterLaunchMs: number;
};

export type AdbConfig = {
  readonly binary: string;
  // Vale per i comandi a colpo singolo: connect, reboot, force-stop, tap.
  readonly commandTimeoutMs: number;
  // La pazienza per il rientro dopo un reboot, che è lento (minuti) e storicamente inaffidabile
  // (FATTO-12). Tenerla separata evita che allungarla allunghi anche tutto il resto.
  readonly bootTimeoutMs: number;
  readonly captureApp: CaptureApp;
};

export type DeviceState = "device" | "offline" | "unauthorized" | "bootloader" | "recovery" | "unknown";

export type Attached = { readonly endpoint: string; readonly state: DeviceState };

const parseState = (raw: string): DeviceState => {
  switch (raw.trim()) {
    case "device":
    case "offline":
    case "unauthorized":
    case "bootloader":
    case "recovery":
      return raw.trim() as DeviceState;
    default:
      return "unknown";
  }
};

// `adb devices` elenca una riga per transport: "<host:porta>\t<stato>". La prima riga è
// l'intestazione e va scartata.
export const parseDevices = (stdout: string): ReadonlyArray<Attached> =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("List of"))
    .flatMap((line) => {
      const [endpoint, state] = line.split(/\s+/);
      return endpoint && state ? [{ endpoint, state: parseState(state) }] : [];
    });

// `wm size` risponde "Physical size: 1080x2400", e con un override anche "Override size: ...", che
// è quella che conta perché è la risoluzione con cui il device sta davvero disegnando.
export const parseScreenSize = (stdout: string): O.Option<ScreenSize> => {
  const matches = [...stdout.matchAll(/(Physical|Override) size:\s*(\d+)x(\d+)/g)];
  const chosen = matches.find((match) => match[1] === "Override") ?? matches[0];
  return chosen ? O.some({ width: Number(chosen[2]), height: Number(chosen[3]) }) : O.none;
};

// `dumpsys window`/`mFocusedApp` dà l'app davvero in primo piano, non la system UI. Le righe
// possono andare a capo, quindi si appiattisce prima di cercare.
export const parseFocusedApp = (stdout: string): O.Option<string> => {
  const flat = stdout.replace(/\n\s*/g, " ");
  const match = flat.match(/mFocusedApp=ActivityRecord\{[^}]*\s([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)/);
  return match?.[1] ? O.some(match[1]) : O.none;
};

export interface AdbCli {
  readonly devices: TE.TaskEither<Shell.ShellFailure, ReadonlyArray<Attached>>;
  readonly connect: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, void>;
  // Best effort: un disconnect fallito non è un guasto, è un transport che non c'era.
  readonly disconnectQuietly: (endpoint: string) => TE.TaskEither<never, void>;
  readonly reboot: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, void>;
  readonly forceStop: (endpoint: string, packageId: string) => TE.TaskEither<Shell.ShellFailure, void>;
  readonly launch: (endpoint: string, packageId: string) => TE.TaskEither<Shell.ShellFailure, void>;
  readonly isActivityResumed: (endpoint: string, activity: string) => TE.TaskEither<Shell.ShellFailure, boolean>;
  readonly wakeUp: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, void>;
  readonly isKeyguardShowing: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, boolean>;
  readonly dismissKeyguard: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, void>;
  readonly screenSize: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, O.Option<ScreenSize>>;
  readonly tap: (endpoint: string, point: Point) => TE.TaskEither<Shell.ShellFailure, void>;
  readonly waitForDevice: (endpoint: string) => TE.TaskEither<Shell.ShellFailure, void>;
}

export const make = (config: AdbConfig, spawn: Shell.Spawn = Shell.bunSpawn): AdbCli => {
  const run = (args: ReadonlyArray<string>, timeoutMs = config.commandTimeoutMs) =>
    spawn(config.binary, args, timeoutMs);

  const onDevice = (endpoint: string, args: ReadonlyArray<string>, timeoutMs?: number) =>
    run(["-s", endpoint, ...args], timeoutMs);

  return {
    devices: pipe(run(["devices"]), TE.map(parseDevices)),

    connect: (endpoint) => pipe(run(["connect", endpoint]), TE.asUnit),

    disconnectQuietly: (endpoint) =>
      pipe(
        run(["disconnect", endpoint]),
        TE.asUnit,
        TE.orElse(() => TE.right<never, void>(undefined)),
      ),

    reboot: (endpoint) => pipe(onDevice(endpoint, ["reboot"]), TE.asUnit),

    forceStop: (endpoint, packageId) => pipe(onDevice(endpoint, ["shell", "am", "force-stop", packageId]), TE.asUnit),

    // `monkey` sulla LAUNCHER invece di `am start -n`: non richiede di conoscere l'attività
    // d'ingresso e toglie lo stato "stopped", che è ciò che serve dopo un force-stop.
    launch: (endpoint, packageId) =>
      pipe(
        onDevice(endpoint, ["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"]),
        TE.asUnit,
      ),

    isActivityResumed: (endpoint, activity) =>
      pipe(
        onDevice(endpoint, ["shell", "dumpsys", "window"]),
        TE.map((stdout) => O.exists((focused: string) => focused.includes(activity))(parseFocusedApp(stdout))),
      ),

    // KEYCODE_WAKEUP non spegne lo schermo se è già acceso, a differenza di POWER.
    wakeUp: (endpoint) => pipe(onDevice(endpoint, ["shell", "input", "keyevent", "KEYCODE_WAKEUP"]), TE.asUnit),

    isKeyguardShowing: (endpoint) =>
      pipe(
        onDevice(endpoint, ["shell", "dumpsys", "window"]),
        TE.map((stdout) => /mDreamingLockscreen=true/.test(stdout) || /mShowingLockscreen=true/.test(stdout)),
      ),

    // Funziona solo su lockscreen senza PIN, che è la configurazione delle camere del lab. Su uno
    // schermo già sbloccato questa swipe scrolla l'app in primo piano: per questo chi la usa
    // controlla prima che il lockscreen ci sia davvero.
    dismissKeyguard: (endpoint) =>
      pipe(onDevice(endpoint, ["shell", "input", "swipe", "540", "1800", "540", "400", "300"]), TE.asUnit),

    screenSize: (endpoint) => pipe(onDevice(endpoint, ["shell", "wm", "size"]), TE.map(parseScreenSize)),

    tap: (endpoint, point) =>
      pipe(onDevice(endpoint, ["shell", "input", "tap", String(point.x), String(point.y)]), TE.asUnit),

    // L'unico comando la cui pazienza si misura in minuti: dopo un reboot il device non risponde
    // per un pezzo, e mDNS a volte non lo rileva nemmeno quando è tornato (FATTO-12).
    waitForDevice: (endpoint) => pipe(onDevice(endpoint, ["wait-for-device"], config.bootTimeoutMs), TE.asUnit),
  };
};
