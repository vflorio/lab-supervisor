import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type * as Interpreter from "../workflow/interpreter";
import * as Compile from "./compile";
import * as EntityRunner from "./entity-runner";
import type { RecoveryLevel } from "./model";

// -------------------------------------------------------------------------------------
// Nessun timer reale: il tempo è solo un numero passato a `observe`.
// -------------------------------------------------------------------------------------

const noopLogger = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => noopLogger,
};

const capabilitiesWith = (impl: Partial<Interpreter.CommandCapabilities>): Interpreter.CommandCapabilities => ({
  restartApp: () => TE.right(undefined),
  ensureActivity: () => TE.right(undefined),
  openUrl: () => TE.right(undefined),
  openDeveloperSettings: () => TE.right(undefined),
  reboot: () => TE.right(undefined),
  wakeUp: () => TE.right(undefined),
  inputTap: () => TE.right(undefined),
  waitForDevice: () => TE.right(undefined),
  waitForActivity: () => TE.right(undefined),
  ...impl,
});

const compileOrThrow = (levels: readonly RecoveryLevel[]): readonly Compile.CompiledLevel[] => {
  const result = Compile.compileLevels(levels);
  if (E.isLeft(result)) throw new Error("test setup: invalid levels");
  return result.right;
};

const GRACE = "1s"; // 1000ms

describe("recovery/entity-runner", () => {
  it("does not run recovery before grace has elapsed", async () => {
    const calls: string[] = [];
    const levels: readonly RecoveryLevel[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(levels), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
      }),
    });

    const lookup = () => false; // sempre non connesso
    await runner.observe(lookup, 0);
    await runner.observe(lookup, 500); // sotto grace (1000ms)

    expect(calls).toEqual([]);
  });

  it("runs the pipeline exactly once when grace elapses, then stays quiet until it recovers", async () => {
    const calls: string[] = [];
    const levels: readonly RecoveryLevel[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(levels), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
      }),
    });

    let value = false;
    const lookup = () => value;

    await runner.observe(lookup, 0); // healthy=false -> pending(since=0)
    await runner.observe(lookup, 999); // ancora sotto grace
    expect(calls).toEqual([]);

    await runner.observe(lookup, 1000); // grace raggiunta -> fired, esegue la pipeline
    expect(calls).toEqual(["reboot"]);

    await runner.observe(lookup, 1001); // ancora non sano: già scattato, non ri-esegue
    await runner.observe(lookup, 5000);
    expect(calls).toEqual(["reboot"]);

    value = true;
    await runner.observe(lookup, 6000); // torna sano -> reset

    value = false;
    await runner.observe(lookup, 6000); // nuovo episodio
    await runner.observe(lookup, 7000); // grace raggiunta di nuovo -> ri-esegue
    expect(calls).toEqual(["reboot", "reboot"]);
  });

  it("retries the pipeline according to the level's retry policy before giving up", async () => {
    let attempts = 0;
    const levels: readonly RecoveryLevel[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 3],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(levels), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "restartApp", packageId: "pkg" }] }],
      capabilities: capabilitiesWith({
        restartApp: () => {
          attempts++;
          return attempts >= 3 ? TE.right(undefined) : TE.left({ type: "WorkflowError", message: "not yet" });
        },
      }),
    });

    const lookup = () => false;
    await runner.observe(lookup, 0);
    await runner.observe(lookup, 1000);

    expect(attempts).toBe(3);
  });

  it("runs independent levels independently, based on each level's own predicate and grace", async () => {
    const fired: string[] = [];
    const levels: readonly RecoveryLevel[] = [
      {
        grace: "1s",
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "level-1" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
      {
        grace: "2s",
        predicate: { type: "ref", name: "recording" },
        pipeline: { type: "workflow", workflowName: "level-2" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(levels), {
      logger: noopLogger as any,
      workflows: [
        { name: "level-1", commands: [{ type: "wakeUp" }] },
        { name: "level-2", commands: [{ type: "reboot" }] },
      ],
      capabilities: capabilitiesWith({
        wakeUp: () => {
          fired.push("level-1");
          return TE.right(undefined);
        },
        reboot: () => {
          fired.push("level-2");
          return TE.right(undefined);
        },
      }),
    });

    // connected recupera subito, recording resta falso per tutta la durata
    const lookup = (name: string) => name === "connected";

    await runner.observe(lookup, 0);
    await runner.observe(lookup, 1000); // level-1 sano, non scatta; level-2 ancora sotto grace (2s)
    expect(fired).toEqual([]);

    await runner.observe(lookup, 2000); // level-2 raggiunge grace -> scatta
    expect(fired).toEqual(["level-2"]);
  });
});
