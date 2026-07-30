import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { match } from "ts-pattern";
import { DurationString } from "../date-time";
import type { Command, Workflow } from "./workflow";

const TapCoordsCodec = t.type({ x: t.number, y: t.number });

// Metadata per la UI: quali comandi esistono e che campi hanno, senza duplicare l'union.
export type CommandFieldKind = "string" | "duration" | "coords";

export interface CommandFieldSchema {
  readonly key: string;
  readonly label: string;
  readonly kind: CommandFieldKind;
}

export interface CommandSchema {
  readonly type: Command["type"];
  readonly description: string;
  readonly fields: readonly CommandFieldSchema[];
}

export const COMMAND_SCHEMA: readonly CommandSchema[] = [
  {
    type: "restartApp",
    description: "Forza lo stop e riavvia l'app indicata",
    fields: [{ key: "packageId", label: "package id", kind: "string" }],
  },
  {
    type: "ensureActivity",
    description: "Porta in primo piano l'activity indicata, avviandola se necessario",
    fields: [
      { key: "packageId", label: "package id", kind: "string" },
      { key: "activity", label: "activity", kind: "string" },
    ],
  },
  {
    type: "openUrl",
    description: "Apre l'URL indicato nel browser di default del device",
    fields: [{ key: "url", label: "url", kind: "string" }],
  },
  { type: "openDeveloperSettings", description: "Apre le impostazioni sviluppatore di Android", fields: [] },
  { type: "reboot", description: "Riavvia il device", fields: [] },
  { type: "wakeUp", description: "Riaccende lo schermo del device", fields: [] },
  {
    type: "inputTap",
    description: "Simula un tap sulle coordinate indicate",
    fields: [{ key: "coords", label: "coords", kind: "coords" }],
  },
  { type: "waitForDevice", description: "Attende che il device sia raggiungibile via ADB", fields: [] },
  {
    type: "waitForActivity",
    description: "Attende che l'activity indicata sia in primo piano",
    fields: [{ key: "activity", label: "activity", kind: "string" }],
  },
  {
    type: "run",
    description: "Esegue un altro workflow per nome",
    fields: [{ key: "workflowName", label: "workflow name", kind: "string" }],
  },
  {
    type: "sleep",
    description: "Attende per la durata indicata",
    fields: [{ key: "duration", label: "duration", kind: "duration" }],
  },
];

const isCommand = (u: unknown): u is Command => typeof u === "object" && u !== null && "type" in u;

const validateCommand = (u: unknown, c: t.Context): t.Validation<Command> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [commandName, ...args]");

  const [name, ...args] = u;
  if (typeof name !== "string") return t.failure(u, c, "First element must be a string (command name)");

  return match<string, t.Validation<Command>>(name)
    .with("restartApp", () => {
      const packageId = args[0];
      if (typeof packageId !== "string") return t.failure(u, c, "restartApp requires a string package id");

      return t.success({ type: "restartApp" as const, packageId });
    })
    .with("ensureActivity", () => {
      const packageId = args[0];
      const activity = args[1];
      if (typeof packageId !== "string") return t.failure(u, c, "ensureActivity requires a string package id");
      if (typeof activity !== "string") return t.failure(u, c, "ensureActivity requires a string activity name");

      return t.success({ type: "ensureActivity" as const, packageId, activity });
    })
    .with("openUrl", () => {
      const url = args[0];
      if (typeof url !== "string") return t.failure(u, c, "openUrl requires a string URL");

      return t.success({ type: "openUrl" as const, url });
    })
    .with("openDeveloperSettings", () => t.success({ type: "openDeveloperSettings" as const }))
    .with("reboot", () => t.success({ type: "reboot" as const }))
    .with("wakeUp", () => t.success({ type: "wakeUp" as const }))
    .with("inputTap", () => {
      const coords = args[0];
      if (!TapCoordsCodec.is(coords)) return t.failure(u, c, "inputTap requires {x, y} coords");

      return t.success({ type: "inputTap" as const, coords });
    })
    .with("waitForDevice", () => t.success({ type: "waitForDevice" as const }))
    .with("waitForActivity", () => {
      const activity = args[0];
      if (typeof activity !== "string") return t.failure(u, c, "waitForActivity requires a string activity name");

      return t.success({ type: "waitForActivity" as const, activity });
    })
    .with("run", () => {
      const workflowName = args[0];
      if (typeof workflowName !== "string") return t.failure(u, c, "run requires a workflow name");

      return t.success({ type: "run" as const, workflowName });
    })
    .with("sleep", () => {
      const duration = args[0];
      if (!DurationString.is(duration)) {
        return t.failure(u, c, "sleep requires a human-readable duration (e.g. 500ms, 2s, 1m)");
      }

      return t.success({ type: "sleep" as const, duration });
    })
    .otherwise(() => t.failure(u, c, `Unknown command: "${name}"`));
};

const encodeCommand = (cmd: Command): unknown[] =>
  match(cmd)
    .with({ type: "restartApp" }, ({ packageId }) => ["restartApp", packageId])
    .with({ type: "ensureActivity" }, ({ packageId, activity }) => ["ensureActivity", packageId, activity])
    .with({ type: "openUrl" }, ({ url }) => ["openUrl", url])
    .with({ type: "openDeveloperSettings" }, () => ["openDeveloperSettings"])
    .with({ type: "reboot" }, () => ["reboot"])
    .with({ type: "wakeUp" }, () => ["wakeUp"])
    .with({ type: "inputTap" }, ({ coords }) => ["inputTap", coords])
    .with({ type: "waitForDevice" }, () => ["waitForDevice"])
    .with({ type: "waitForActivity" }, ({ activity }) => ["waitForActivity", activity])
    .with({ type: "run" }, ({ workflowName }) => ["run", workflowName])
    .with({ type: "sleep" }, ({ duration }) => ["sleep", duration])
    .exhaustive();

// JSON: ["commandName", ...args] -> Command
export const CommandCodec = new t.Type<Command, unknown[], unknown>(
  "Command",
  isCommand,
  validateCommand,
  encodeCommand,
);

// Workflow - JSON: ["name", [[cmd], [cmd], ...]]
const isWorkflow = (u: unknown): u is Workflow => typeof u === "object" && u !== null && "name" in u;

const validateWorkflow = (u: unknown, c: t.Context): t.Validation<Workflow> => {
  if (!Array.isArray(u) || u.length !== 2) return t.failure(u, c, "Expected: [workflowName, [commands...]]");

  const [name, commands] = u;
  if (typeof name !== "string") return t.failure(u, c, "Workflow name must be a string");
  if (!Array.isArray(commands)) return t.failure(u, c, "Workflow commands must be an array");

  const decoded: Command[] = [];
  for (let i = 0; i < commands.length; i++) {
    const result = CommandCodec.validate(commands[i], [
      ...c,
      { key: `[${i}]`, type: CommandCodec, actual: commands[i] },
    ]);
    if (E.isLeft(result)) return result as t.Validation<Workflow>;
    decoded.push(result.right);
  }

  return t.success({ name, commands: decoded });
};

const encodeWorkflow = (w: Workflow): unknown => [w.name, w.commands.map((cmd) => CommandCodec.encode(cmd))];

export const WorkflowJsonCodec = new t.Type<Workflow, unknown, unknown>(
  "Workflow",
  isWorkflow,
  validateWorkflow,
  encodeWorkflow,
);
