import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as Predicates from "../predicates/expression";
import { createPredicateStream } from "../predicates/feed";
import * as Retry from "../retry/retry";
import type * as Interpreter from "../workflow/interpreter";
import type { RecoveryPolicy } from "./model";
import * as Runner from "./runner";

const noopLogger = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => noopLogger,
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const noopCapabilities = (): Interpreter.CommandCapabilities => ({
  restartApp: () => TE.right(undefined),
  ensureActivity: () => TE.right(undefined),
  openUrl: () => TE.right(undefined),
  openDeveloperSettings: () => TE.right(undefined),
  reboot: () => TE.right(undefined),
  wakeUp: () => TE.right(undefined),
  inputTap: () => TE.right(undefined),
  waitForDevice: () => TE.right(undefined),
});

describe("recovery/runner", () => {
  it("discovers a new entity from the stream and fires recovery once its grace elapses", async () => {
    const fired: string[] = [];
    const stream = createPredicateStream();

    const policy: RecoveryPolicy = {
      label: "test-policy",
      domain: "test-domain",
      tripwires: [
        {
          grace: "10ms",
          predicate: Predicates.ref("healthy"),
          pipeline: { type: "workflow", workflowName: "fix" },
          retry: [
            ["constantDelay", "1ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = Runner.start(policy, {
      logger: noopLogger as any,
      stream,
      workflows: [{ name: "fix", commands: [{ type: "wakeUp" }] }],
      capabilitiesFor: (entityId) => ({
        ...noopCapabilities(),
        wakeUp: () => {
          fired.push(entityId);
          return TE.right(undefined);
        },
      }),
      tickPolicy: Retry.constantDelay(5),
      descriptor: { id: "recovery-test", label: "recovery-test", policyLabel: "constant 5ms" },
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isLeft(result)) return;

    stream.emit({ domain: "test-domain", entityId: "e1", name: "healthy", value: false });

    await sleep(60);
    result.right.stop();

    expect(fired).toContain("e1");
  });

  it("tracks two entities in the same domain independently", async () => {
    const fired: string[] = [];
    const stream = createPredicateStream();

    const policy: RecoveryPolicy = {
      label: "test-policy",
      domain: "test-domain",
      tripwires: [
        {
          grace: "10ms",
          predicate: Predicates.ref("healthy"),
          pipeline: { type: "workflow", workflowName: "fix" },
          retry: [
            ["constantDelay", "1ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = Runner.start(policy, {
      logger: noopLogger as any,
      stream,
      workflows: [{ name: "fix", commands: [{ type: "wakeUp" }] }],
      capabilitiesFor: (entityId) => ({
        ...noopCapabilities(),
        wakeUp: () => {
          fired.push(entityId);
          return TE.right(undefined);
        },
      }),
      tickPolicy: Retry.constantDelay(5),
      descriptor: { id: "recovery-test", label: "recovery-test", policyLabel: "constant 5ms" },
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isLeft(result)) return;

    stream.emit({ domain: "test-domain", entityId: "e1", name: "healthy", value: false });
    stream.emit({ domain: "test-domain", entityId: "e2", name: "healthy", value: false });

    await sleep(60);
    result.right.stop();

    expect(fired).toContain("e1");
    expect(fired).toContain("e2");
  });

  it("ignores facts from other domains", async () => {
    const fired: string[] = [];
    const stream = createPredicateStream();

    const policy: RecoveryPolicy = {
      label: "test-policy",
      domain: "test-domain",
      tripwires: [
        {
          grace: "10ms",
          predicate: Predicates.ref("healthy"),
          pipeline: { type: "workflow", workflowName: "fix" },
          retry: [
            ["constantDelay", "1ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = Runner.start(policy, {
      logger: noopLogger as any,
      stream,
      workflows: [{ name: "fix", commands: [{ type: "wakeUp" }] }],
      capabilitiesFor: (entityId) => ({
        ...noopCapabilities(),
        wakeUp: () => {
          fired.push(entityId);
          return TE.right(undefined);
        },
      }),
      tickPolicy: Retry.constantDelay(5),
      descriptor: { id: "recovery-test", label: "recovery-test", policyLabel: "constant 5ms" },
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isLeft(result)) return;

    stream.emit({ domain: "other-domain", entityId: "e1", name: "healthy", value: false });

    await sleep(60);
    result.right.stop();

    expect(fired).toEqual([]);
  });

  // Il tick è l'unico a poter far scattare un grace scaduto (il predicate feed emette solo sui
  // cambi di valore): se aspettasse le osservazioni, una pipeline di recovery in corso su e1 lo
  // congelerebbe, e il grace di e2 - già scaduto - non scatterebbe mai.
  it("keeps ticking for the other entities while a recovery pipeline is in flight", async () => {
    const fired: string[] = [];
    const stream = createPredicateStream();
    let releaseE1: () => void = () => {};
    const e1Blocked = new Promise<void>((resolve) => {
      releaseE1 = resolve;
    });

    const policy: RecoveryPolicy = {
      label: "test-policy",
      domain: "test-domain",
      tripwires: [
        {
          grace: "10ms",
          predicate: Predicates.ref("healthy"),
          pipeline: { type: "workflow", workflowName: "fix" },
          retry: [
            ["constantDelay", "1ms"],
            ["limitRetries", 1],
          ],
        },
      ],
    };

    const result = Runner.start(policy, {
      logger: noopLogger as any,
      stream,
      workflows: [{ name: "fix", commands: [{ type: "wakeUp" }] }],
      capabilitiesFor: (entityId) => ({
        ...noopCapabilities(),
        wakeUp: () =>
          TE.fromTask(async () => {
            fired.push(entityId);
            if (entityId === "e1") await e1Blocked; // la recovery di e1 non finisce mai, da sola
          }),
      }),
      tickPolicy: Retry.constantDelay(5),
      descriptor: { id: "recovery-test", label: "recovery-test", policyLabel: "constant 5ms" },
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isLeft(result)) return;

    stream.emit({ domain: "test-domain", entityId: "e1", name: "healthy", value: false });
    await sleep(30); // e1 è ora appesa dentro la propria pipeline

    stream.emit({ domain: "test-domain", entityId: "e2", name: "healthy", value: false });
    await sleep(60); // il fatto porta e2 solo a `pending`: a farla scattare deve essere il tick

    releaseE1();
    result.right.stop();

    expect(fired).toContain("e2");
  });

  it("fails fast when the policy's retry config is malformed", () => {
    const stream = createPredicateStream();
    const policy: RecoveryPolicy = {
      label: "broken",
      domain: "test-domain",
      tripwires: [
        {
          grace: "10ms",
          predicate: Predicates.ref("healthy"),
          pipeline: { type: "workflow", workflowName: "fix" },
          retry: [],
        },
      ],
    };

    const result = Runner.start(policy, {
      logger: noopLogger as any,
      stream,
      workflows: [],
      capabilitiesFor: () => noopCapabilities(),
      tickPolicy: Retry.constantDelay(5),
      descriptor: { id: "recovery-test", label: "recovery-test", policyLabel: "constant 5ms" },
    });

    expect(E.isLeft(result)).toBe(true);
  });
});
