import * as E from "fp-ts/Either";
import type { DurationString } from "../date-time";
import { type AppError, of } from "../errors";
import type { Condition } from "./condition";

// Flat, named command sequence; retry/escalation lives in Recovery Model and Pipeline

// Tap coordinates (normalized 0-1 or pixels)
export type TapCoords = { readonly x: number; readonly y: number };

// Discriminated union dei comandi supportati.
// JSON format: ["commandName", ...args] -> viene decodificato nel tipo corretto.
export type Command =
  | { readonly type: "restartApp"; readonly packageId: string }
  | { readonly type: "ensureActivity"; readonly packageId: string; readonly activity: string }
  | { readonly type: "launchApp"; readonly packageId: string }
  | { readonly type: "forceStopApp"; readonly packageId: string }
  | { readonly type: "dismissKeyguard" }
  | { readonly type: "openUrl"; readonly url: string }
  | { readonly type: "openDeveloperSettings" }
  | { readonly type: "reboot" }
  | { readonly type: "wakeUp" }
  | { readonly type: "inputTap"; readonly coords: TapCoords }
  | { readonly type: "waitForDevice" }
  | { readonly type: "run"; readonly workflowName: string }
  // Fixed pause, not condition-based (unlike wait*); useful between commands for UI animation
  | { readonly type: "sleep"; readonly duration: DurationString }
  // Wait for condition to become true; distinguishes healing from command success (needed for or-branches)
  | { readonly type: "await"; readonly condition: Condition; readonly timeout: DurationString }
  // Conditional branch; both arms are workflow names (flat config, no nested blocks)
  | {
      readonly type: "when";
      readonly condition: Condition;
      readonly thenWorkflow: string;
      readonly elseWorkflow?: string;
    };

// Name + ordered command sequence; JSON: [name, [command, ...]]
export interface Workflow {
  readonly name: string;
  readonly commands: readonly Command[];
}

export interface WorkflowDecodeError extends AppError<"WorkflowDecodeError"> {}

export const workflowDecodeError = of("WorkflowDecodeError");

// Lookup workflow by name (used by run command)
export const findWorkflow = (workflows: readonly Workflow[], name: string): E.Either<WorkflowDecodeError, Workflow> =>
  E.fromNullable(workflowDecodeError(`Workflow not found: "${name}"`))(workflows.find((w) => w.name === name) ?? null);
