import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as Retry from "../retry/retry";
import * as TaskRunner from "./runner";
import { createLoopStream } from "./stream";

const noopLogger = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => noopLogger,
};

const descriptor = { id: "test", label: "Test loop", policyLabel: "test" };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("task-runner", () => {
  it("ticks repeatedly, respecting the delay produced by the policy", async () => {
    let ticks = 0;
    const loop = TaskRunner.create({
      logger: noopLogger,
      descriptor,
      policy: Retry.constantDelay(10),
      onTick: async () => {
        ticks++;
        return E.right(undefined);
      },
    });

    const done = loop.start();
    await sleep(35);
    loop.stop();
    const result = await done;

    expect(E.isRight(result)).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(2);
  });

  it("stops on its own once the policy is exhausted (returns null)", async () => {
    let ticks = 0;
    const loop = TaskRunner.create({
      logger: noopLogger,
      descriptor,
      policy: Retry.limitRetries(2),
      onTick: async () => {
        ticks++;
        return E.right(undefined);
      },
    });

    const result = await loop.start();

    expect(E.isRight(result)).toBe(true);
    expect(ticks).toBe(3); // iterations 0, 1, 2 all tick; the 3rd check finds the policy exhausted
  });

  it("stop() aborts the loop before the next tick fires", async () => {
    let ticks = 0;
    const loop = TaskRunner.create({
      logger: noopLogger,
      descriptor,
      policy: Retry.constantDelay(10),
      onTick: async () => {
        ticks++;
        return E.right(undefined);
      },
    });

    const done = loop.start();
    await sleep(15);
    loop.stop();
    await done;

    const ticksAtStop = ticks;
    await sleep(30);

    expect(ticks).toBe(ticksAtStop);
  });

  it("keeps ticking on a failed tick, and reports it via the loop feed", async () => {
    let ticks = 0;
    const statuses: string[] = [];
    const loopStream = createLoopStream();
    loopStream.subscribe((entry) => statuses.push(entry.status));

    const loop = TaskRunner.create({
      logger: noopLogger,
      descriptor,
      policy: Retry.constantDelay(10),
      loopStream,
      onTick: async () => {
        ticks++;
        return ticks === 1 ? E.left({ type: "TestError", message: "boom" }) : E.right(undefined);
      },
    });

    const done = loop.start();
    await sleep(25);
    loop.stop();
    await done;

    expect(ticks).toBeGreaterThanOrEqual(2);
    expect(statuses).toContain("error");
    expect(statuses).toContain("running");
  });

  // Un throw non catturato dentro onTick usciva da runLoop e finiva assorbito dal TE.tryCatch
  // di `start`: il loop moriva senza evento Stopped, quindi restava "running" sulla dashboard.
  it("survives a rejecting tick, reporting it as a failed tick instead of dying", async () => {
    let ticks = 0;
    const statuses: string[] = [];
    const loopStream = createLoopStream();
    loopStream.subscribe((entry) => statuses.push(entry.status));

    const loop = TaskRunner.create({
      logger: noopLogger,
      descriptor,
      policy: Retry.constantDelay(10),
      loopStream,
      onTick: async () => {
        ticks++;
        if (ticks === 1) throw new Error("boom");
        return E.right(undefined);
      },
    });

    const done = loop.start();
    await sleep(25);
    loop.stop();
    const result = await done;

    expect(E.isRight(result)).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(2);
    expect(statuses).toContain("error");
  });
});
