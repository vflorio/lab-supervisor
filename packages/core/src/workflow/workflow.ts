import * as E from "fp-ts/Either";
import { type AppError, of } from "../errors";

// -------------------------------------------------------------------------------------
// Model - Workflow: una sequenza piatta e nominata di comandi.
// Nessuna policy di retry, nessuna escalation: quella logica vive nel Recovery Model
// (packages/core/src/recovery) e nella Pipeline (./pipeline.ts) che compone più workflow.
// -------------------------------------------------------------------------------------

// Coordinate per tap ADB (valori normalizzati 0-1 o pixel)
export type TapCoords = { readonly x: number; readonly y: number };

// Discriminated union dei comandi supportati.
// JSON format: ["commandName", ...args] -> viene decodificato nel tipo corretto.
export type Command =
  | { readonly type: "restartApp"; readonly packageId: string }
  | { readonly type: "ensureActivity"; readonly packageId: string; readonly activity: string }
  | { readonly type: "openUrl"; readonly url: string }
  | { readonly type: "openDeveloperSettings" }
  | { readonly type: "reboot" }
  | { readonly type: "wakeUp" }
  | { readonly type: "inputTap"; readonly coords: TapCoords }
  | { readonly type: "waitForDevice" }
  | { readonly type: "waitForActivity"; readonly activity: string }
  | { readonly type: "run"; readonly workflowName: string };

// Un workflow è un nome + una sequenza ordinata di comandi.
// JSON: ["nome", [command, command, ...]]
export interface Workflow {
  readonly name: string;
  readonly commands: readonly Command[];
}

export interface WorkflowDecodeError extends AppError<"WorkflowDecodeError"> {}

export const workflowDecodeError = of("WorkflowDecodeError");

// -------------------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------------------

// Risolve un nome workflow dall'elenco (usato dal comando "run" per concatenare workflow)
export const findWorkflow = (workflows: readonly Workflow[], name: string): E.Either<WorkflowDecodeError, Workflow> =>
  E.fromNullable(workflowDecodeError(`Workflow not found: "${name}"`))(workflows.find((w) => w.name === name) ?? null);
