import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { match } from "ts-pattern";
import { DurationString } from "../date-time";
import { ConditionCodec } from "./condition-codec";
import type { Command, Workflow } from "./workflow";

const TapCoordsCodec = t.type({ x: t.number, y: t.number });

// Metadata for UI: available commands and their fields (avoids duplicating the union)
export type CommandFieldKind = "string" | "duration" | "coords" | "condition";

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
    type: "launchApp",
    description: "Avvia l'app indicata senza fermarla prima (no-op se è già in foreground)",
    fields: [{ key: "packageId", label: "package id", kind: "string" }],
  },
  {
    type: "forceStopApp",
    description: "Forza lo stop dell'app indicata senza riavviarla",
    fields: [{ key: "packageId", label: "package id", kind: "string" }],
  },
  {
    type: "dismissKeyguard",
    description:
      "Sblocca il lockscreen con una swipe (da usare con la probe keyguardShowing: a schermo sbloccato scrolla l'app in foreground)",
    fields: [],
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
    type: "run",
    description: "Esegue un altro workflow per nome",
    fields: [{ key: "workflowName", label: "workflow name", kind: "string" }],
  },
  {
    type: "sleep",
    description: "Attende per la durata indicata",
    fields: [{ key: "duration", label: "duration", kind: "duration" }],
  },
  {
    type: "await",
    description: "Attende che la condizione sia vera (fallisce allo scadere del timeout)",
    fields: [
      { key: "condition", label: "condition", kind: "condition" },
      { key: "timeout", label: "timeout", kind: "duration" },
    ],
  },
  {
    type: "when",
    description: "Esegue un workflow solo se la condizione è vera, con un ramo alternativo opzionale",
    fields: [
      { key: "condition", label: "condition", kind: "condition" },
      { key: "thenWorkflow", label: "then", kind: "string" },
      { key: "elseWorkflow", label: "else", kind: "string" },
    ],
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
    .with("launchApp", () => {
      const packageId = args[0];
      if (typeof packageId !== "string") return t.failure(u, c, "launchApp requires a string package id");

      return t.success({ type: "launchApp" as const, packageId });
    })
    .with("forceStopApp", () => {
      const packageId = args[0];
      if (typeof packageId !== "string") return t.failure(u, c, "forceStopApp requires a string package id");

      return t.success({ type: "forceStopApp" as const, packageId });
    })
    .with("dismissKeyguard", () => t.success({ type: "dismissKeyguard" as const }))
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
    .with("await", () => {
      const condition = ConditionCodec.validate(args[0], [...c, { key: "[1]", type: ConditionCodec, actual: args[0] }]);
      if (E.isLeft(condition)) return condition as t.Validation<Command>;

      const timeout = args[1];
      if (!DurationString.is(timeout)) {
        return t.failure(u, c, "await requires a human-readable timeout (e.g. 30s, 2m)");
      }

      return t.success({ type: "await" as const, condition: condition.right, timeout });
    })
    .with("when", () => {
      const condition = ConditionCodec.validate(args[0], [...c, { key: "[1]", type: ConditionCodec, actual: args[0] }]);
      if (E.isLeft(condition)) return condition as t.Validation<Command>;

      const thenWorkflow = args[1];
      const elseWorkflow = args[2];
      if (typeof thenWorkflow !== "string") return t.failure(u, c, "when requires the name of the workflow to run");
      if (elseWorkflow !== undefined && typeof elseWorkflow !== "string") {
        return t.failure(u, c, "when: the optional else branch must be a workflow name");
      }

      return t.success({
        type: "when" as const,
        condition: condition.right,
        thenWorkflow,
        ...(elseWorkflow ? { elseWorkflow } : {}),
      });
    })
    .otherwise(() => t.failure(u, c, `Unknown command: "${name}"`));
};

const encodeCommand = (cmd: Command): unknown[] =>
  match(cmd)
    .with({ type: "restartApp" }, ({ packageId }) => ["restartApp", packageId])
    .with({ type: "ensureActivity" }, ({ packageId, activity }) => ["ensureActivity", packageId, activity])
    .with({ type: "launchApp" }, ({ packageId }) => ["launchApp", packageId])
    .with({ type: "forceStopApp" }, ({ packageId }) => ["forceStopApp", packageId])
    .with({ type: "dismissKeyguard" }, () => ["dismissKeyguard"])
    .with({ type: "openUrl" }, ({ url }) => ["openUrl", url])
    .with({ type: "openDeveloperSettings" }, () => ["openDeveloperSettings"])
    .with({ type: "reboot" }, () => ["reboot"])
    .with({ type: "wakeUp" }, () => ["wakeUp"])
    .with({ type: "inputTap" }, ({ coords }) => ["inputTap", coords])
    .with({ type: "waitForDevice" }, () => ["waitForDevice"])
    .with({ type: "run" }, ({ workflowName }) => ["run", workflowName])
    .with({ type: "sleep" }, ({ duration }) => ["sleep", duration])
    .with({ type: "await" }, ({ condition, timeout }) => ["await", ConditionCodec.encode(condition), timeout])
    .with({ type: "when" }, ({ condition, thenWorkflow, elseWorkflow }) =>
      elseWorkflow
        ? ["when", ConditionCodec.encode(condition), thenWorkflow, elseWorkflow]
        : ["when", ConditionCodec.encode(condition), thenWorkflow],
    )
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
