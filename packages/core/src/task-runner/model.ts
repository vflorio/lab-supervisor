import { match } from "ts-pattern";
import type { AppError } from "../errors";

// Stato del motore generico dietro ogni processo di background (vedi ./runner.ts): nessuna
// nozione di dominio, solo la salute del ciclo onTick/delay. A differenza di android-bridge
// non c'è un layer di Command/interpret - gli unici "comandi" sarebbero RunTick/Sleep/Abort,
// cioè esattamente il control-flow dell'interprete, quindi il reducer resta puro e l'esecuzione
// vive tutta in runner.ts.

export type LoopState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Ticking"; readonly iteration: number; readonly lastTickAt?: number }
  | {
      readonly _tag: "Waiting";
      readonly iteration: number;
      readonly lastTickAt: number;
      readonly nextTickAt: number;
      readonly delayMs: number;
      readonly detail?: string;
    }
  | {
      readonly _tag: "Failing";
      readonly iteration: number;
      readonly lastTickAt: number;
      readonly nextTickAt: number;
      readonly delayMs: number;
      readonly error: AppError;
    }
  | { readonly _tag: "Exhausted"; readonly iteration: number; readonly lastTickAt: number }
  | { readonly _tag: "Stopped"; readonly iteration: number; readonly lastTickAt?: number };

export const initial: LoopState = { _tag: "Idle" };

// Il timestamp sta nell'evento, non nel reducer: così `reduce` resta puro e testabile senza
// iniettare un clock. `delayMs` arriva già calcolato insieme all'esito del tick (il runner lo
// conosce nello stesso istante, vedi runner.ts) invece di un evento `DelayComputed` separato -
// evita uno stato intermedio "esito noto ma delay ignoto" che non corrisponde a nulla di reale.
export type LoopEvent =
  | { readonly _tag: "TickStarted"; readonly at: number }
  | { readonly _tag: "TickSucceeded"; readonly at: number; readonly detail?: string; readonly delayMs: number | null }
  | { readonly _tag: "TickFailed"; readonly at: number; readonly error: AppError; readonly delayMs: number | null }
  | { readonly _tag: "StopRequested"; readonly at: number };

// Estrae iteration/lastTickAt dallo stato corrente per portarli avanti in una transizione che
// non li cambia (es. Idle -> Ticking, o qualunque stato -> Stopped)
export const iterationOf = (state: LoopState): number => ("iteration" in state ? state.iteration : 0);

export const lastTickAtOf = (state: LoopState): number | undefined =>
  "lastTickAt" in state ? state.lastTickAt : undefined;

// -------------------------------------------------------------------------------------
// Proiezione verso il filo (vedi ./project.ts)
// -------------------------------------------------------------------------------------

export type LoopStatus = "running" | "idle" | "stopped" | "exhausted" | "error";

export const statusOf = (state: LoopState): LoopStatus =>
  match(state)
    .with({ _tag: "Idle" }, (): LoopStatus => "idle")
    .with({ _tag: "Ticking" }, (): LoopStatus => "running")
    .with({ _tag: "Waiting" }, (): LoopStatus => "running")
    .with({ _tag: "Failing" }, (): LoopStatus => "error")
    .with({ _tag: "Exhausted" }, (): LoopStatus => "exhausted")
    .with({ _tag: "Stopped" }, (): LoopStatus => "stopped")
    .exhaustive();

export const nextTickAtOf = (state: LoopState): number | undefined =>
  match(state)
    .with({ _tag: "Waiting" }, (s) => s.nextTickAt)
    .with({ _tag: "Failing" }, (s) => s.nextTickAt)
    .otherwise(() => undefined);

export const delayMsOf = (state: LoopState): number | undefined =>
  match(state)
    .with({ _tag: "Waiting" }, (s) => s.delayMs)
    .with({ _tag: "Failing" }, (s) => s.delayMs)
    .otherwise(() => undefined);

export const detailOf = (state: LoopState): string | undefined =>
  match(state)
    .with({ _tag: "Waiting" }, (s) => s.detail)
    .otherwise(() => undefined);

// Identità di un loop, stabile per tutta la vita del processo - usata come chiave sullo
// stream e come tag del logger (`descriptor.id`), il testo mostrato all'utente è `label`.
export interface LoopDescriptor {
  readonly id: string;
  readonly label: string;
  readonly policyLabel: string;
}

// Wire type verso la UI (Service -> Web): un valore per loop, non uno storico di transizioni -
// di un heartbeat non esiste nulla da riprodurre, esiste solo l'ultimo battito.
export interface LoopEntry {
  readonly id: string;
  readonly label: string;
  readonly policyLabel: string;
  readonly status: LoopStatus;
  readonly iteration: number;
  readonly lastTickAt?: number;
  readonly nextTickAt?: number;
  readonly delayMs?: number;
  readonly detail?: string;
}

export const describeState = (state: LoopState): string =>
  match(state)
    .with({ _tag: "Idle" }, () => "Idle")
    .with({ _tag: "Ticking" }, (s) => `Ticking(#${s.iteration})`)
    .with({ _tag: "Waiting" }, (s) => `Waiting(#${s.iteration}, next in ${s.delayMs}ms)`)
    .with({ _tag: "Failing" }, (s) => `Failing(#${s.iteration}, ${s.error.message})`)
    .with({ _tag: "Exhausted" }, (s) => `Exhausted(#${s.iteration})`)
    .with({ _tag: "Stopped" }, (s) => `Stopped(#${s.iteration})`)
    .exhaustive();
