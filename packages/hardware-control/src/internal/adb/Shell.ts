// Il solo punto del package che lancia processi. Travaso di `legacy/core/src/shell.ts`, con la
// stessa scelta che lì era già giusta: `Spawn` è un parametro, non `Bun.spawn` cablato dentro.
// Il timeout è obbligatorio e non opzionale, ed è la differenza che conta: qualunque chiamata verso
// adb può restare appesa (FATTO-12), e una senza scadenza terrebbe fermo un tick intero (INV-10).
// `ShellFailure` non attraversa mai una porta: chi lo riceve lo traduce in `RemedyOutcome` o in
// `ProbeOutcome` (A-6, NO-10).

import * as TE from "fp-ts/TaskEither";

export type ShellFailure =
  // Appeso oltre la scadenza. È il caso normale di un transport incastrato, non l'eccezione.
  | { readonly _tag: "Timeout"; readonly afterMs: number }
  // Ha girato e ha detto di no. `stderr` è la diagnosi, e finisce nel dossier.
  | { readonly _tag: "NonZeroExit"; readonly code: number; readonly stderr: string }
  // Non è nemmeno partito: binario assente, PATH sbagliato, permessi. È un guasto della macchina
  // che ospita il supervisore, non del device.
  | { readonly _tag: "SpawnFailed"; readonly detail: string };

export const timeout = (afterMs: number): ShellFailure => ({ _tag: "Timeout", afterMs });

export const nonZeroExit = (code: number, stderr: string): ShellFailure => ({ _tag: "NonZeroExit", code, stderr });

export const spawnFailed = (detail: string): ShellFailure => ({ _tag: "SpawnFailed", detail });

export const describe = (failure: ShellFailure): string => {
  switch (failure._tag) {
    case "Timeout":
      return `comando appeso oltre ${failure.afterMs}ms`;
    case "NonZeroExit":
      return `exit ${failure.code}: ${failure.stderr.trim().slice(0, 200) || "nessun dettaglio"}`;
    case "SpawnFailed":
      return `impossibile eseguire il comando: ${failure.detail}`;
  }
};

export type Spawn = (
  command: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
) => TE.TaskEither<ShellFailure, string>;

// L'unica implementazione che lancia processi davvero. Il timeout uccide il processo invece di
// limitarsi a smettere di aspettarlo: un `adb` orfano che tiene occupato un transport è
// esattamente il difetto che FATTO-12 descrive.
export const bunSpawn: Spawn = (command, args, timeoutMs) =>
  TE.tryCatch(
    async () => {
      const child = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
      const killer = setTimeout(() => child.kill(), timeoutMs);
      try {
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (child.killed && code !== 0) throw timeout(timeoutMs);
        if (code !== 0) throw nonZeroExit(code, stderr);
        return stdout.trim();
      } finally {
        clearTimeout(killer);
      }
    },
    (error): ShellFailure =>
      typeof error === "object" && error !== null && "_tag" in error
        ? (error as ShellFailure)
        : spawnFailed(error instanceof Error ? error.message : String(error)),
  );
