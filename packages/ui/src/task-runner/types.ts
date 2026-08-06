import type { LoopStatus } from "@supervisor/core/task-runner/model";
import { match } from "ts-pattern";
import type { StatusTone } from "../registry/StatusPill";

// Stesso stato che il motore generico dietro ogni loop di background pubblica sul filo
// (vedi @supervisor/core/task-runner): nessun adattatore, la UI legge la proiezione così com'è.
export type LoopState = LoopStatus;

// Stato della connessione websocket dell'app verso il servizio.
export type ServiceConnection = "connecting" | "online" | "reconnecting";

// Unico punto in cui uno stato di loop diventa un tono, cosi' ogni LoopWidget nella
// ServiceStrip resta coerente con gli altri.
export function loopTone(state: LoopState): StatusTone {
  return match(state)
    .with("running", () => "success" as const)
    .with("exhausted", "error", () => "error" as const)
    .otherwise(() => "disabled" as const);
}
