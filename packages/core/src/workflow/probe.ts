import type * as TE from "fp-ts/TaskEither";
import type { WorkflowError } from "./env";

// Probes (read-only), unlike commands (write). Fail explicitly; missing fact is false

export type Orientation = "landscape" | "portrait";

export interface Probes {
  // Screen power state (doesn't include lockscreen)
  readonly screenOn: () => TE.TaskEither<WorkflowError, boolean>;
  // Lockscreen state (note: dismissKeyguard on unlocked screen scrolls foreground app)
  readonly keyguardShowing: () => TE.TaskEither<WorkflowError, boolean>;
  // Foreground activity (full component or substring)
  readonly activityResumed: (activity: string) => TE.TaskEither<WorkflowError, boolean>;
  readonly orientation: (expected: Orientation) => TE.TaskEither<WorkflowError, boolean>;
}

export type ProbeName = keyof Probes;

// Metadata for UI and codec; mirrors COMMAND_SCHEMA
export interface ProbeSchema {
  readonly name: ProbeName;
  readonly description: string;
  readonly args: readonly { readonly label: string; readonly options?: readonly string[] }[];
}

export const PROBE_SCHEMA: readonly ProbeSchema[] = [
  { name: "screenOn", description: "Lo schermo del device è acceso", args: [] },
  { name: "keyguardShowing", description: "Il lockscreen è mostrato", args: [] },
  { name: "activityResumed", description: "L'activity indicata è in foreground", args: [{ label: "activity" }] },
  {
    name: "orientation",
    description: "Il device è nell'orientamento indicato",
    args: [{ label: "orientation", options: ["landscape", "portrait"] }],
  },
];

export const findProbeSchema = (name: string): ProbeSchema | undefined =>
  PROBE_SCHEMA.find((schema) => schema.name === name);
