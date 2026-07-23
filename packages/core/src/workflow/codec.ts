import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { match } from "ts-pattern";
import type { Command, Workflow } from "./workflow";

// -------------------------------------------------------------------------------------
// Codecs
// -------------------------------------------------------------------------------------

const TapCoordsCodec = t.type({ x: t.number, y: t.number });

// Command

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
    .exhaustive();

// JSON: ["commandName", ...args] -> Command
export const CommandCodec = new t.Type<Command, unknown[], unknown>(
  "Command",
  isCommand,
  validateCommand,
  encodeCommand,
);

// ----
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
