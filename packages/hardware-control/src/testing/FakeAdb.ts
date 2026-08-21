// adb finto: uno `Spawn` che risponde dai transport che gli si scrivono e registra ogni comando
// ricevuto, in ordine. È così che si mette alla prova la sequenza post-boot senza un telefono —
// l'ordine dei gradini *è* il comportamento, e qui si legge come una lista.
// Sa anche fare la cosa che l'hardware fa e che i test dimenticano: restare appeso (FATTO-12).

import * as TE from "fp-ts/TaskEither";
import type { DeviceState } from "../internal/adb/Cli";
import type * as Shell from "../internal/adb/Shell";

export type Transport = { readonly endpoint: string; readonly state: DeviceState };

export interface FakeAdb {
  readonly spawn: Shell.Spawn;
  readonly attach: (endpoint: string, state?: DeviceState) => void;
  readonly detach: (endpoint: string) => void;
  // Fa fallire ogni comando il cui primo argomento corrisponde. `undefined` toglie il guasto.
  readonly failOn: (verb: string, failure: Shell.ShellFailure | undefined) => void;
  // Lo stato dello schermo che il device racconta a `dumpsys window` e a `wm size`.
  readonly keyguard: (showing: boolean) => void;
  readonly foreground: (component: string | undefined) => void;
  readonly screen: (width: number, height: number) => void;
  readonly commands: () => ReadonlyArray<ReadonlyArray<string>>;
}

// Un comando su un device è `-s <endpoint> <verbo> ...`: il verbo è ciò su cui i test vogliono
// puntare il dito, e scavarlo qui evita di ripetere quella logica in ogni asserzione.
const verbOf = (args: ReadonlyArray<string>): string => (args[0] === "-s" ? (args[2] ?? "") : (args[0] ?? ""));

export const make = (initial: ReadonlyArray<Transport> = []): FakeAdb => {
  const transports = new Map<string, DeviceState>(initial.map((entry) => [entry.endpoint, entry.state]));
  const failures = new Map<string, Shell.ShellFailure>();
  const calls: ReadonlyArray<string>[] = [];
  let keyguardShowing = false;
  let focusedApp: string | undefined;
  let screenSize = { width: 2400, height: 1080 };

  const respond = (args: ReadonlyArray<string>): TE.TaskEither<Shell.ShellFailure, string> => {
    const verb = verbOf(args);
    const failure = failures.get(verb);
    if (failure !== undefined) return TE.left(failure);

    if (verb === "devices")
      return TE.right(
        ["List of devices attached", ...[...transports].map(([endpoint, state]) => `${endpoint}\t${state}`)].join("\n"),
      );

    if (verb === "connect") {
      transports.set(args[1] ?? "", "device");
      return TE.right(`connected to ${args[1]}`);
    }

    if (verb === "disconnect") {
      transports.delete(args[1] ?? "");
      return TE.right(`disconnected ${args[1]}`);
    }

    // `wm size` è la lettura con cui la sonda distingue un transport vivo da uno elencato ma
    // incastrato, ed è anche ciò che risolve i tap espressi in frazione.
    if (args.includes("wm") && args.includes("size"))
      return TE.right(`Physical size: ${screenSize.width}x${screenSize.height}`);

    if (args.includes("dumpsys") && args.includes("window"))
      return TE.right(
        [
          `mDreamingLockscreen=${keyguardShowing}`,
          focusedApp ? `mFocusedApp=ActivityRecord{abc123 u0 ${focusedApp} t42}` : "mFocusedApp=null",
        ].join("\n"),
      );

    return TE.right("");
  };

  return {
    spawn: (_command, args, _timeoutMs) =>
      // Pigro come il vero: registrare alla costruzione conterebbe comandi mai eseguiti.
      TE.flatten(
        TE.fromIO(() => {
          calls.push([...args]);
          return respond(args);
        }),
      ),
    attach: (endpoint, state = "device") => {
      transports.set(endpoint, state);
    },
    detach: (endpoint) => {
      transports.delete(endpoint);
    },
    failOn: (verb, failure) => {
      if (failure === undefined) failures.delete(verb);
      else failures.set(verb, failure);
    },
    keyguard: (showing) => {
      keyguardShowing = showing;
    },
    foreground: (component) => {
      focusedApp = component;
    },
    screen: (width, height) => {
      screenSize = { width, height };
    },
    commands: () => calls.map((args) => [...args]),
  };
};

// I verbi effettivamente eseguiti, in ordine, senza il rumore di `-s <endpoint>`: è la forma in cui
// una sequenza si legge in un'asserzione.
export const verbs = (adb: FakeAdb): ReadonlyArray<string> => adb.commands().map(verbOf);

// Come `verbs`, ma tenendo abbastanza parole da distinguere fra loro i comandi `shell`, che
// altrimenti si leggerebbero tutti uguali proprio dove l'ordine conta di piu.
export const trace = (adb: FakeAdb): ReadonlyArray<string> =>
  adb.commands().map((args) => (args[0] === "-s" ? args.slice(2) : args).slice(0, 3).join(" "));
