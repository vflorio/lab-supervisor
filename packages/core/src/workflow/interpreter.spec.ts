import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as Interpreter from "./interpreter";
import type * as Workflow from "./workflow";

//  fixtures

const noopEnv = (log: string[] = []): Interpreter.WorkflowEnv => ({
  workflows: [],
  logger: {
    debug: (msg) => () => log.push(`[DEBUG] ${msg}`),
    info: (msg) => () => log.push(`[INFO] ${msg}`),
    warn: (msg) => () => log.push(`[WARN] ${msg}`),
    error: (msg) => () => log.push(`[ERROR] ${msg}`),
    logNetwork: (msg) => () => log.push(`[NETWORK] ${msg}`),
  },
  capabilities: {
    restartApp: () => TE.right(undefined),
    ensureActivity: () => TE.right(undefined),
    openUrl: () => TE.right(undefined),
    openDeveloperSettings: () => TE.right(undefined),
    reboot: () => TE.right(undefined),
    wakeUp: () => TE.right(undefined),
    inputTap: () => TE.right(undefined),
    waitForDevice: () => TE.right(undefined),
    waitForActivity: () => TE.right(undefined),
  },
});

describe("workflow interpreter", () => {
  it("executes a flat sequence of commands successfully", async () => {
    const log: string[] = [];
    const env = noopEnv(log);

    const workflow: Workflow.Workflow = {
      name: "test-wf",
      commands: [{ type: "restartApp", packageId: "com.example.app" }, { type: "waitForDevice" }],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
  });

  it("propagates a command failure as a Left", async () => {
    const env: Interpreter.WorkflowEnv = {
      ...noopEnv(),
      capabilities: {
        ...noopEnv().capabilities,
        restartApp: () => TE.left({ type: "WorkflowError", message: "nope" }),
      },
    };

    const workflow: Workflow.Workflow = {
      name: "fail-wf",
      commands: [{ type: "restartApp", packageId: "pkg" }],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isLeft(result)).toBe(true);
  });

  it("resolves workflow references via the 'run' command", async () => {
    const tapCalls: Array<{ x: number; y: number }> = [];
    const env: Interpreter.WorkflowEnv = {
      workflows: [{ name: "my-workflow", commands: [{ type: "inputTap", coords: { x: 0.5, y: 0.5 } }] }],
      logger: noopEnv().logger,
      capabilities: {
        ...noopEnv().capabilities,
        inputTap: (coords) => {
          tapCalls.push(coords);
          return TE.right(undefined);
        },
      },
    };

    const workflow: Workflow.Workflow = {
      name: "outer-wf",
      commands: [{ type: "run", workflowName: "my-workflow" }],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
    expect(tapCalls).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("fails with a WorkflowError when the referenced workflow is missing", async () => {
    const env = noopEnv();

    const workflow: Workflow.Workflow = {
      name: "outer-wf",
      commands: [{ type: "run", workflowName: "missing-workflow" }],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toContain("missing-workflow");
    }
  });

  it("run() looks up a workflow by name from the provided list", async () => {
    const env = noopEnv();
    const workflows: readonly Workflow.Workflow[] = [
      { name: "open-developer-settings", commands: [{ type: "openDeveloperSettings" }] },
    ];

    const result = await Interpreter.run(workflows, "open-developer-settings")(env)();
    expect(E.isRight(result)).toBe(true);
  });

  it("run() fails when the workflow name is not found", async () => {
    const env = noopEnv();

    const result = await Interpreter.run([], "does-not-exist")(env)();
    expect(E.isLeft(result)).toBe(true);
  });

  it("sleep pauses for the given duration without touching capabilities", async () => {
    const env = noopEnv();

    const workflow: Workflow.Workflow = {
      name: "sleep-wf",
      commands: [{ type: "sleep", duration: "20ms" }],
    };

    const start = Date.now();
    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    const elapsed = Date.now() - start;

    expect(E.isRight(result)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });
});
