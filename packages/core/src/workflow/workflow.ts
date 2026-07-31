import * as E from "fp-ts/Either";
import type { DurationString } from "../date-time";
import { type AppError, of } from "../errors";
import type { PredicateExpression } from "../predicates/expression";

// Workflow: una sequenza piatta e nominata di comandi. Nessuna policy di retry, nessuna
// escalation: quella logica vive nel Recovery Model e nella Pipeline che compone più workflow.

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
  | { readonly type: "run"; readonly workflowName: string }
  // Pausa fissa, indipendente da qualunque condizione del device (a differenza di wait*) - utile
  // per dare respiro tra due comandi (es. dopo un tap, prima che l'UI finisca di animare)
  | { readonly type: "sleep"; readonly duration: DurationString }
  // Attende che un'espressione di predicati applicativi diventi vera. È l'unico comando il cui
  // esito non dipende dal device ma dai fatti osservati dai tracker: serve a far significare a
  // un workflow "ha guarito" invece di "i comandi sono andati a buon fine" - senza, l'esito di
  // un ramo di Pipeline non dice nulla sul problema che doveva risolvere (vedi ./pipeline.ts).
  // Timeout scaduto = comando fallito, cioè ramo `or` che escala.
  | { readonly type: "awaitPredicate"; readonly expr: PredicateExpression; readonly timeout: DurationString };

// Un workflow è un nome + una sequenza ordinata di comandi.
// JSON: ["nome", [command, command, ...]]
export interface Workflow {
  readonly name: string;
  readonly commands: readonly Command[];
}

export interface WorkflowDecodeError extends AppError<"WorkflowDecodeError"> {}

export const workflowDecodeError = of("WorkflowDecodeError");

// Risolve un nome workflow dall'elenco (usato dal comando "run" per concatenare workflow)
export const findWorkflow = (workflows: readonly Workflow[], name: string): E.Either<WorkflowDecodeError, Workflow> =>
  E.fromNullable(workflowDecodeError(`Workflow not found: "${name}"`))(workflows.find((w) => w.name === name) ?? null);
