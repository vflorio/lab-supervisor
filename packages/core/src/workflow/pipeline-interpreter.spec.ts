import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type * as Interpreter from "./interpreter";
import * as PipelineInterpreter from "./pipeline-interpreter";
import type * as Workflow from "./workflow";

// fixtures

const noopCapabilities = (): Interpreter.CommandCapabilities => ({
  restartApp: () => TE.right(undefined),
  ensureActivity: () => TE.right(undefined),
  openUrl: () => TE.right(undefined),
  openDeveloperSettings: () => TE.right(undefined),
  reboot: () => TE.right(undefined),
  wakeUp: () => TE.right(undefined),
  inputTap: () => TE.right(undefined),
  waitForDevice: () => TE.right(undefined),
  waitForActivity: () => TE.right(undefined),
});

const envWith = (workflows: readonly Workflow.Workflow[], calls: string[] = []): Interpreter.WorkflowEnv => ({
  workflows,
  logger: {
    debug: () => () => {},
    info: () => () => {},
    warn: () => () => {},
    error: () => () => {},
    logNetwork: () => () => {},
  },
  capabilities: {
    ...noopCapabilities(),
    restartApp: (pkg) => {
      calls.push(`restartApp:${pkg}`);
      return TE.right(undefined);
    },
    reboot: () => {
      calls.push("reboot");
      return TE.right(undefined);
    },
  },
});

const failingEnv = (calls: string[]): Interpreter.WorkflowEnv => ({
  workflows: [{ name: "always-fails", commands: [{ type: "restartApp", packageId: "pkg" }] }],
  logger: {
    debug: () => () => {},
    info: () => () => {},
    warn: () => () => {},
    error: () => () => {},
    logNetwork: () => () => {},
  },
  capabilities: {
    ...noopCapabilities(),
    restartApp: (pkg) => {
      calls.push(`restartApp:${pkg}`);
      return TE.left({ type: "WorkflowError", message: "always fails" });
    },
  },
});

describe("pipeline interpreter", () => {
  it("resolves a workflow leaf to true on success", async () => {
    const workflows: readonly Workflow.Workflow[] = [
      { name: "ok-workflow", commands: [{ type: "restartApp", packageId: "com.example" }] },
    ];
    const env = envWith(workflows);

    const result = await PipelineInterpreter.interpretPipeline({ type: "workflow", workflowName: "ok-workflow" })(
      env,
    )();
    expect(result).toStrictEqual(E.right(true));
  });

  it("resolves a workflow leaf to false (not Left) when its commands fail", async () => {
    const calls: string[] = [];
    const env = failingEnv(calls);

    const result = await PipelineInterpreter.interpretPipeline({ type: "workflow", workflowName: "always-fails" })(
      env,
    )();
    expect(result).toStrictEqual(E.right(false));
    expect(calls).toEqual(["restartApp:pkg"]);
  });

  it("fails with a Left when the workflow reference is unresolvable (config error)", async () => {
    const env = envWith([]);

    const result = await PipelineInterpreter.interpretPipeline({ type: "workflow", workflowName: "missing" })(env)();
    expect(E.isLeft(result)).toBe(true);
  });

  it("and: requires every pipeline to resolve true, in sequence", async () => {
    const calls: string[] = [];
    const workflows: readonly Workflow.Workflow[] = [
      { name: "a", commands: [{ type: "restartApp", packageId: "a" }] },
      { name: "b", commands: [{ type: "reboot" }] },
    ];
    const env = envWith(workflows, calls);

    const result = await PipelineInterpreter.interpretPipeline({
      type: "and",
      pipelines: [
        { type: "workflow", workflowName: "a" },
        { type: "workflow", workflowName: "b" },
      ],
    })(env)();

    expect(result).toStrictEqual(E.right(true));
    expect(calls).toEqual(["restartApp:a", "reboot"]);
  });

  it("and: short-circuits on the first false, skipping the rest", async () => {
    const calls: string[] = [];
    const env = failingEnv(calls);

    const result = await PipelineInterpreter.interpretPipeline({
      type: "and",
      pipelines: [
        { type: "workflow", workflowName: "always-fails" },
        { type: "workflow", workflowName: "always-fails" },
      ],
    })(env)();

    expect(result).toStrictEqual(E.right(false));
    expect(calls.length).toBe(1);
  });

  it("or: escalates to the next pipeline when the previous resolves false", async () => {
    const calls: string[] = [];
    const workflows: readonly Workflow.Workflow[] = [
      { name: "primary", commands: [{ type: "restartApp", packageId: "primary" }] },
      { name: "secondary", commands: [{ type: "reboot" }] },
    ];
    const env: Interpreter.WorkflowEnv = {
      ...envWith(workflows, calls),
      capabilities: {
        ...noopCapabilities(),
        restartApp: (pkg) => {
          calls.push(`restartApp:${pkg}`);
          return TE.left({ type: "WorkflowError", message: "primary failed" });
        },
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
      },
    };

    const result = await PipelineInterpreter.interpretPipeline({
      type: "or",
      pipelines: [
        { type: "workflow", workflowName: "primary" },
        { type: "workflow", workflowName: "secondary" },
      ],
    })(env)();

    expect(result).toStrictEqual(E.right(true));
    expect(calls).toEqual(["restartApp:primary", "reboot"]);
  });

  it("or: resolves false when every pipeline resolves false", async () => {
    const calls: string[] = [];
    const env = failingEnv(calls);

    const result = await PipelineInterpreter.interpretPipeline({
      type: "or",
      pipelines: [
        { type: "workflow", workflowName: "always-fails" },
        { type: "workflow", workflowName: "always-fails" },
      ],
    })(env)();

    expect(result).toStrictEqual(E.right(false));
    expect(calls.length).toBe(2);
  });

  // Lo scenario di produzione: riavvio l'app, se non basta riavvio il device. Senza
  // awaitPredicate il primo ramo uscirebbe pulito (i comandi ADB non falliscono) e l'`or` non
  // escalerebbe mai - l'esito del ramo direbbe "comandi eseguiti", non "problema risolto".
  it("or: escalates when the first branch runs clean but its predicate never comes back", async () => {
    const calls: string[] = [];
    let connected = false;

    const workflows: readonly Workflow.Workflow[] = [
      {
        name: "restart-app",
        commands: [
          { type: "restartApp", packageId: "app" },
          { type: "awaitPredicate", expr: { type: "ref", name: "connected" }, timeout: "40ms" },
        ],
      },
      {
        name: "reboot-device",
        commands: [
          { type: "reboot" },
          { type: "awaitPredicate", expr: { type: "ref", name: "connected" }, timeout: "100ms" },
        ],
      },
    ];

    const env: Interpreter.WorkflowEnv = {
      ...envWith(workflows, calls),
      // Il riavvio dell'app non risolve; solo il reboot rimette online il device
      capabilities: {
        ...noopCapabilities(),
        restartApp: (pkg) => {
          calls.push(`restartApp:${pkg}`);
          return TE.right(undefined);
        },
        reboot: () => {
          calls.push("reboot");
          setTimeout(() => {
            connected = true;
          }, 20);
          return TE.right(undefined);
        },
      },
      lookup: () => connected,
    };

    const result = await PipelineInterpreter.interpretPipeline({
      type: "or",
      pipelines: [
        { type: "workflow", workflowName: "restart-app" },
        { type: "workflow", workflowName: "reboot-device" },
      ],
    })(env)();

    expect(result).toStrictEqual(E.right(true));
    expect(calls).toEqual(["restartApp:app", "reboot"]);
  });

  it("not: negates the inner pipeline's result", async () => {
    const workflows: readonly Workflow.Workflow[] = [
      { name: "ok-workflow", commands: [{ type: "restartApp", packageId: "com.example" }] },
    ];
    const env = envWith(workflows);

    const result = await PipelineInterpreter.interpretPipeline({
      type: "not",
      pipeline: { type: "workflow", workflowName: "ok-workflow" },
    })(env)();

    expect(result).toStrictEqual(E.right(false));
  });
});
