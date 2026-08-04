import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";

import * as Condition from "./condition";
import * as Interpreter from "./interpreter";
import type * as Probe from "./probe";
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
  commands: {
    restartApp: () => TE.right(undefined),
    ensureActivity: () => TE.right(undefined),
    openUrl: () => TE.right(undefined),
    openDeveloperSettings: () => TE.right(undefined),
    reboot: () => TE.right(undefined),
    wakeUp: () => TE.right(undefined),
    inputTap: () => TE.right(undefined),
    waitForDevice: () => TE.right(undefined),
  },
});

const noopProbes = (): Probe.Probes => ({
  screenOn: () => TE.right(true),
  keyguardShowing: () => TE.right(false),
  activityResumed: () => TE.right(true),
  orientation: () => TE.right(true),
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
      commands: {
        ...noopEnv().commands,
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
      commands: {
        ...noopEnv().commands,
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

  it("await resolves immediately when the condition is already true", async () => {
    const env: Interpreter.WorkflowEnv = { ...noopEnv(), lookup: () => true };

    const workflow: Workflow.Workflow = {
      name: "await-wf",
      commands: [{ type: "await", condition: Condition.ref("camera_connected"), timeout: "2s" }],
    };

    const start = Date.now();
    const result = await Interpreter.interpretWorkflow(workflow)(env)();

    expect(E.isRight(result)).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });

  // Il caso che dà senso al comando: i fatti li aggiorna un tracker, non il workflow - il
  // lookup va quindi riletto ad ogni giro, non catturato all'avvio.
  it("await re-reads the lookup and resolves when the fact flips while polling", async () => {
    let connected = false;
    const env: Interpreter.WorkflowEnv = { ...noopEnv(), lookup: () => connected };
    setTimeout(() => {
      connected = true;
    }, 20);

    const workflow: Workflow.Workflow = {
      name: "await-wf",
      commands: [{ type: "await", condition: Condition.ref("camera_connected"), timeout: "100ms" }],
    };

    const result = await Interpreter.interpretWorkflow(workflow)(env)();
    expect(E.isRight(result)).toBe(true);
  });

  it("await fails when the condition is still false at the timeout", async () => {
    const env: Interpreter.WorkflowEnv = { ...noopEnv(), lookup: () => false };

    const workflow: Workflow.Workflow = {
      name: "await-wf",
      commands: [{ type: "await", condition: Condition.ref("camera_connected"), timeout: "60ms" }],
    };

    const start = Date.now();
    const result = await Interpreter.interpretWorkflow(workflow)(env)();

    expect(E.isLeft(result)).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(60);
  });

  it("await fails fast when the env carries no lookup, instead of waiting out the timeout", async () => {
    const env = noopEnv();

    const workflow: Workflow.Workflow = {
      name: "await-wf",
      commands: [{ type: "await", condition: Condition.ref("camera_connected"), timeout: "10s" }],
    };

    const start = Date.now();
    const result = await Interpreter.interpretWorkflow(workflow)(env)();

    expect(E.isLeft(result)).toBe(true);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("await polls a probe until it flips", async () => {
    let resumed = false;
    setTimeout(() => {
      resumed = true;
    }, 20);

    const env: Interpreter.WorkflowEnv = {
      ...noopEnv(),
      probes: { ...noopProbes(), activityResumed: () => TE.right(resumed) },
    };

    const workflow: Workflow.Workflow = {
      name: "await-wf",
      commands: [
        { type: "await", condition: Condition.probe("activityResumed", "com.example.Main"), timeout: "100ms" },
      ],
    };

    expect(E.isRight(await Interpreter.interpretWorkflow(workflow)(env)())).toBe(true);
  });

  it("when runs the `then` workflow only if the condition holds, the `else` one otherwise", async () => {
    const calls: string[] = [];
    const workflows: readonly Workflow.Workflow[] = [
      { name: "then-wf", commands: [{ type: "reboot" }] },
      { name: "else-wf", commands: [{ type: "wakeUp" }] },
    ];

    const envWith = (connected: boolean): Interpreter.WorkflowEnv => ({
      ...noopEnv(),
      workflows,
      lookup: () => connected,
      commands: {
        ...noopEnv().commands,
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
        wakeUp: () => {
          calls.push("wakeUp");
          return TE.right(undefined);
        },
      },
    });

    const workflow: Workflow.Workflow = {
      name: "guard-wf",
      commands: [
        { type: "when", condition: Condition.ref("connected"), thenWorkflow: "then-wf", elseWorkflow: "else-wf" },
      ],
    };

    await Interpreter.interpretWorkflow(workflow)(envWith(true))();
    await Interpreter.interpretWorkflow(workflow)(envWith(false))();

    expect(calls).toEqual(["reboot", "wakeUp"]);
  });

  it("when without an else branch is a no-op on a false condition", async () => {
    const calls: string[] = [];
    const env: Interpreter.WorkflowEnv = {
      ...noopEnv(),
      workflows: [{ name: "then-wf", commands: [{ type: "reboot" }] }],
      lookup: () => false,
      commands: {
        ...noopEnv().commands,
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
      },
    };

    const workflow: Workflow.Workflow = {
      name: "guard-wf",
      commands: [{ type: "when", condition: Condition.ref("connected"), thenWorkflow: "then-wf" }],
    };

    expect(E.isRight(await Interpreter.interpretWorkflow(workflow)(env)())).toBe(true);
    expect(calls).toEqual([]);
  });

  // Un errore di valutazione non deve diventare "condizione falsa": prendere il ramo `else` su
  // un ADB muto è una decisione presa su niente.
  it("when fails when the condition cannot be evaluated, instead of taking the else branch", async () => {
    const calls: string[] = [];
    const env: Interpreter.WorkflowEnv = {
      ...noopEnv(),
      workflows: [{ name: "else-wf", commands: [{ type: "wakeUp" }] }],
      probes: {
        ...noopProbes(),
        screenOn: () => TE.left({ type: "WorkflowError", message: "adb is not answering" }),
      },
      commands: {
        ...noopEnv().commands,
        wakeUp: () => {
          calls.push("wakeUp");
          return TE.right(undefined);
        },
      },
    };

    const workflow: Workflow.Workflow = {
      name: "guard-wf",
      commands: [
        { type: "when", condition: Condition.probe("screenOn"), thenWorkflow: "then-wf", elseWorkflow: "else-wf" },
      ],
    };

    expect(E.isLeft(await Interpreter.interpretWorkflow(workflow)(env)())).toBe(true);
    expect(calls).toEqual([]);
  });

  // Con `when` la ricorsione è una cosa che uno vuole scrivere: senza bound, un ciclo in config
  // girerebbe per sempre invece di fallire.
  it("bounds nesting depth, so a cyclic run/when fails instead of looping forever", async () => {
    const env: Interpreter.WorkflowEnv = {
      ...noopEnv(),
      workflows: [
        { name: "ping", commands: [{ type: "run", workflowName: "pong" }] },
        { name: "pong", commands: [{ type: "run", workflowName: "ping" }] },
      ],
    };

    const result = await Interpreter.run(env.workflows, "ping")(env)();

    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) expect(result.left.message).toContain("too deep");
  });

  // Short-circuit: un fatto già vero non deve costare una chiamata ADB
  it("does not run a probe when the boolean algebra has already decided", async () => {
    let probeCalls = 0;
    const env: Interpreter.WorkflowEnv = {
      ...noopEnv(),
      lookup: () => true,
      probes: {
        ...noopProbes(),
        screenOn: () => {
          probeCalls += 1;
          return TE.right(true);
        },
      },
    };

    const workflow: Workflow.Workflow = {
      name: "await-wf",
      commands: [
        {
          type: "await",
          condition: Condition.or([Condition.ref("connected"), Condition.probe("screenOn")]),
          timeout: "1s",
        },
      ],
    };

    expect(E.isRight(await Interpreter.interpretWorkflow(workflow)(env)())).toBe(true);
    expect(probeCalls).toBe(0);
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
